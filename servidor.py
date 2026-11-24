import hashlib
import hmac
import json
import mimetypes
import os
import re
import secrets
import smtplib
import sqlite3
import ssl
import threading
import time
from email.message import EmailMessage
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent
ACCOUNT_DB = ROOT / ".MuebleriaVJ-cuentas.sqlite3"
ADMIN_EMAIL = os.getenv("CASA_ADMIN_EMAIL", "admin@MuebleriaVJ.mx").strip().lower()
ADMIN_PASSWORD = os.getenv("CASA_ADMIN_PASSWORD", "MuebleriaVJ123")
SESSION_AGE = 8 * 60 * 60
EMAIL = re.compile(r"[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+")
ORDER_ID = re.compile(r"CF-[A-F0-9]{8}")
sessions = {}
mail_attempts = {}
state_lock = threading.Lock()
mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("text/javascript", ".mjs")


def digest(password, salt):
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 600_000)


def account_store():
    return sqlite3.connect(ACCOUNT_DB)


def init_accounts():
    with account_store() as db:
        db.execute("CREATE TABLE IF NOT EXISTS customers (email TEXT PRIMARY KEY, salt BLOB, password BLOB)")


def smtp_configured():
    return bool(os.getenv("CASA_SMTP_HOST") and os.getenv("CASA_SMTP_FROM"))


def send_ticket(recipient, order_id, ticket):
    message = EmailMessage()
    message["From"] = os.environ["CASA_SMTP_FROM"]
    message["To"] = recipient
    message["Subject"] = f"Muebleria VJ | Pedido {order_id}"
    message.set_content(f"Gracias por comprar en Muebleria VJ. Adjuntamos el ticket de tu pedido {order_id}.\n\n{ticket}")
    message.add_attachment(ticket.encode("utf-8"), maintype="text", subtype="plain", params={"charset": "utf-8"}, filename=f"Ticket-{order_id}.txt")
    security = os.getenv("CASA_SMTP_SECURITY", "starttls").lower()
    if security not in {"starttls", "ssl"}:
        raise ValueError("CASA_SMTP_SECURITY debe ser starttls o ssl.")
    context = ssl.create_default_context()
    port = int(os.getenv("CASA_SMTP_PORT", "465" if security == "ssl" else "587"))
    host = os.environ["CASA_SMTP_HOST"]
    connection = smtplib.SMTP_SSL(host, port, timeout=10, context=context) if security == "ssl" else smtplib.SMTP(host, port, timeout=10)
    with connection as smtp:
        if security == "starttls":
            smtp.starttls(context=context)
        if os.getenv("CASA_SMTP_USER"):
            smtp.login(os.environ["CASA_SMTP_USER"], os.environ["CASA_SMTP_PASSWORD"])
        smtp.send_message(message)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def route(self):
        return urlsplit(self.path).path

    def is_public_file(self):
        path = self.route()
        return path in {"/", "/index.html", "/style.css", "/app.js", "/store.mjs"} or bool(
            re.fullmatch(r"/assets/[a-z0-9-]+\.(webp|svg)", path)
        )

    def json_response(self, status, data, cookie=None):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        if cookie:
            self.send_header("Set-Cookie", cookie)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def token(self):
        cookie = SimpleCookie(self.headers.get("Cookie", ""))
        return cookie["casa_session"].value if "casa_session" in cookie else ""

    def user(self):
        token = self.token()
        with state_lock:
            entry = sessions.get(token)
            if entry and entry[0] > time.monotonic():
                return entry[1]
            sessions.pop(token, None)
        return None

    def do_GET(self):
        if self.route() == "/api/session":
            self.json_response(200, {"user": self.user(), "emailEnabled": smtp_configured()})
        elif self.is_public_file():
            super().do_GET()
        else:
            self.send_error(404)

    def do_HEAD(self):
        if self.is_public_file():
            super().do_HEAD()
        else:
            self.send_error(404)

    def do_POST(self):
        port = self.server.server_port
        allowed = {f"http://localhost:{port}", f"http://127.0.0.1:{port}"}
        if self.headers.get("Origin") not in allowed or self.headers.get_content_type() != "application/json":
            self.json_response(403, {"error": "Abre Muebleria VJ desde el servidor local."})
            return
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 < size <= 32_768:
                raise ValueError
            data = json.loads(self.rfile.read(size))
            if not isinstance(data, dict):
                raise ValueError
        except (ValueError, UnicodeError):
            self.json_response(400, {"error": "Solicitud inválida."})
            return

        path = self.route()
        if path in {"/api/login", "/api/register"}:
            self.authenticate(data, path == "/api/register")
        elif path == "/api/logout":
            with state_lock:
                sessions.pop(self.token(), None)
            self.json_response(200, {"ok": True}, "casa_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict")
        elif path == "/api/send-ticket":
            self.email_ticket(data)
        else:
            self.json_response(404, {"error": "Ruta desconocida."})

    def authenticate(self, data, register):
        email = data.get("email")
        password = data.get("password")
        if not isinstance(email, str) or not isinstance(password, str):
            self.json_response(400, {"error": "Escribe tu correo y contraseña."})
            return
        email = email.strip().lower()
        if not EMAIL.fullmatch(email) or len(email) > 150 or not 1 <= len(password) <= 128:
            self.json_response(400, {"error": "Revisa el correo y la contraseña."})
            return
        if register:
            if len(password) < 8 or email == ADMIN_EMAIL:
                self.json_response(400, {"error": "Usa un correo de cliente y una contraseña de al menos 8 caracteres."})
                return
            salt = secrets.token_bytes(16)
            try:
                with account_store() as db:
                    db.execute("INSERT INTO customers VALUES (?, ?, ?)", (email, salt, digest(password, salt)))
            except sqlite3.IntegrityError:
                self.json_response(409, {"error": "Ya hay una cuenta con ese correo. Inicia sesión."})
                return
        elif email == ADMIN_EMAIL:
            if not hmac.compare_digest(password.encode(), ADMIN_PASSWORD.encode()):
                self.bad_login()
                return
        else:
            with account_store() as db:
                result = db.execute("SELECT salt, password FROM customers WHERE email = ?", (email,)).fetchone()
            salt, stored = result or (bytes(16), bytes(32))
            if not hmac.compare_digest(digest(password, salt), stored) or not result:
                self.bad_login()
                return
        token = secrets.token_urlsafe(32)
        user = {"email": email, "role": "admin" if email == ADMIN_EMAIL else "customer"}
        with state_lock:
            now = time.monotonic()
            expired = [key for key, entry in sessions.items() if entry[0] <= now]
            for key in expired:
                del sessions[key]
            sessions.pop(self.token(), None)
            sessions[token] = (now + SESSION_AGE, user)
        self.json_response(200, {"user": user, "emailEnabled": smtp_configured()},
                           f"casa_session={token}; Path=/; HttpOnly; SameSite=Strict")

    def bad_login(self):
        self.json_response(401, {"error": "El correo o la contraseña no coinciden."})

    def email_ticket(self, data):
        user = self.user()
        if not user or user["role"] != "customer":
            self.json_response(401, {"error": "Inicia sesión como cliente para solicitar el correo."})
            return
        if not smtp_configured():
            self.json_response(503, {"error": "El envío por correo aún no está configurado."})
            return
        order_id, ticket = data.get("id"), data.get("ticket")
        if not isinstance(order_id, str) or not ORDER_ID.fullmatch(order_id) or not isinstance(ticket, str) or not 0 < len(ticket) <= 10_000:
            self.json_response(400, {"error": "El ticket no es válido."})
            return
        key = (user["email"], order_id)
        with state_lock:
            previous = mail_attempts.get(key)
            if previous != "sent" and previous != "sending":
                mail_attempts[key] = "sending"
        if previous == "sent":
            self.json_response(200, {"ok": True})
            return
        if previous == "sending":
            self.json_response(409, {"error": "El correo ya se está enviando."})
            return
        try:
            send_ticket(user["email"], order_id, ticket)
        except (OSError, ValueError, KeyError, smtplib.SMTPException):
            with state_lock:
                mail_attempts.pop(key, None)
            self.json_response(502, {"error": "No se pudo enviar el correo. Tu ticket sigue disponible."})
            return
        with state_lock:
            mail_attempts[key] = "sent"
        self.json_response(200, {"ok": True})


if __name__ == "__main__":
    init_accounts()
    with ThreadingHTTPServer(("127.0.0.1", 8000), Handler) as server:
        print("Muebleria VJ: http://localhost:8000", flush=True)
        server.serve_forever()

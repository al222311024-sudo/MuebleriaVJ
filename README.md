# Casa Forma

Tienda local de muebles con cuentas de cliente, panel de administración y tickets de compra.

## Iniciar en Visual Studio Code

1. Descomprime el ZIP y abre la carpeta `Casa-Forma` en Visual Studio Code.
2. Abre la terminal integrada en esa carpeta y ejecuta:

   ```powershell
   py servidor.py
   ```

   En macOS o Linux, usa `python3 servidor.py`. Se requiere Python 3.9 o posterior.
3. Abre [http://localhost:8000](http://localhost:8000). Deja la terminal abierta mientras uses la tienda. Para cerrarla, presiona **Ctrl + C**.

## Iniciar sesión y probar una compra

- **Cliente.** Selecciona **Crear cuenta de cliente** y registra tu correo y una contraseña de al menos ocho caracteres. Agrega un mueble al carrito y confirma el pedido. El navegador descarga un archivo `Ticket-CF-XXXXXXXX.txt`. Puedes descargarlo otra vez desde **Mi cuenta → Mis pedidos**.
- **Administrador.** Inicia sesión desde la misma pantalla con tu cuenta de administrador. En **Inventario** puedes agregar, editar o eliminar muebles. En **Pedidos** puedes consultar pedidos y cambiar su estado. Las variables `CASA_ADMIN_EMAIL` y `CASA_ADMIN_PASSWORD` permiten configurar el acceso de administrador desde la terminal antes de iniciar el servidor.

Las compras son de demostración y conservan el historial. El servidor guarda las cuentas en un archivo SQLite local y las contraseñas de cliente con hash y salt. El catálogo, el carrito, los favoritos y los pedidos se guardan en el navegador. Si usabas una versión anterior en `localhost:8000`, abre esa misma dirección y usa el mismo correo para consultar los pedidos que ya tenías.

## Activar el envío automático de tickets por correo

Necesitas los datos SMTP de una cuenta remitente. Configura los valores en la terminal **antes** de iniciar el servidor. El siguiente ejemplo es para PowerShell. Reemplaza los valores de muestra con los de tu proveedor.

```powershell
$env:CASA_SMTP_HOST = 'smtp.tu-proveedor.com'
$env:CASA_SMTP_PORT = '587'
$env:CASA_SMTP_SECURITY = 'starttls'
$env:CASA_SMTP_USER = 'tu-cuenta@ejemplo.com'
$env:CASA_SMTP_FROM = $env:CASA_SMTP_USER
$clave = Read-Host 'Contraseña SMTP o contraseña de aplicación' -AsSecureString
$env:CASA_SMTP_PASSWORD = (New-Object System.Net.NetworkCredential('', $clave)).Password
py servidor.py
```

Si tu proveedor usa SSL directo, cambia el puerto a `465` y usa `ssl` en `CASA_SMTP_SECURITY`. La tienda envía el ticket como adjunto al correo del cliente al confirmar el pedido. Si el envío falla, se conserva la compra y puedes reintentar desde el pedido. Puedes usar siempre la descarga TXT, incluso sin SMTP.

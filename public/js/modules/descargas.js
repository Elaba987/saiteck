// descargas.js - Utilidad compartida para descargar contenido de texto como archivo
//
// Antes, el patrón "crear Blob -> URL.createObjectURL -> <a download> -> click ->
// revokeObjectURL" estaba duplicado, con el mismo código exacto, en:
//   - productos.js  (descargarArchivoAlmacen)
//   - pedidos.js    (descargarReporteCompras, descargarTicketPedido)
//   - ventas.js     (descargarTicket)
//   - auditoria.js  (exportarCSV)
//
// Centralizarlo aquí no cambia ningún comportamiento (mismo Blob, mismo tipo
// MIME configurable, mismo nombre de archivo) — solo elimina la repetición.

export function descargarArchivoTexto(contenido, nombreArchivo, tipoMime = 'text/plain') {
    const blob = new Blob([contenido], { type: tipoMime });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');

    a.href     = url;
    a.download = nombreArchivo;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
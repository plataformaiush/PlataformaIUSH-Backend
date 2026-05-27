import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import DocumentoModel from '../../models/archivos/documentoModel.js';

const __filename  = fileURLToPath(import.meta.url);
const __dirname   = path.dirname(__filename);

const UPLOADS_DIR = path.join(__dirname, '../../uploads');
const CARPETAS    = ['documentos', 'imagenes'];
const URL_PUBLICA = `${process.env.BASE_URL || 'http://localhost:3000'}/src/`;

class LocalFileService {
    constructor() {
        this._inicializarCarpetas();
    }

    _inicializarCarpetas() {
        for (const carpeta of [UPLOADS_DIR, ...CARPETAS.map(c => path.join(UPLOADS_DIR, c))]) {
            if (!fs.existsSync(carpeta)) {
                fs.mkdirSync(carpeta, { recursive: true });
                console.log(`✓ Carpeta creada: ${carpeta}`);
            }
        }
        console.log('✓ Servicio de archivos local inicializado');
        console.log(`  Directorio: ${UPLOADS_DIR}`);
    }

    _resolverRuta(carpeta = 'documentos') {
        const rutaCarpeta = path.join(UPLOADS_DIR, carpeta);
        if (!rutaCarpeta.startsWith(UPLOADS_DIR)) {
            throw new Error('Ruta no permitida');
        }
        return rutaCarpeta;
    }

    // ----------------------------------------------------------------
    // SUBIR → retorna DocumentoModel (sin urlPublica — no es GET)
    // ----------------------------------------------------------------
    async subirArchivo({ nombre, mimeType, buffer, carpeta = 'documentos' }) {
        try {
            const rutaCarpeta  = this._resolverRuta(carpeta);
            const nombreSeguro = this._nombreSeguro(nombre);
            const rutaArchivo  = path.join(rutaCarpeta, nombreSeguro);

            fs.writeFileSync(rutaArchivo, buffer);

            const stats = fs.statSync(rutaArchivo);

            return DocumentoModel.fromStat({
                carpeta,
                nombre      : nombreSeguro,
                originalName: nombre,
                mimeType,
                stats,
                path        : rutaArchivo,
                // urlPublica no se incluye en la subida
            });
        } catch (error) {
            console.error('Error subiendo archivo:', error.message);
            throw error;
        }
    }

    // ----------------------------------------------------------------
    // DESCARGAR por fileId relativo
    // fileId = "documentos/timestamp_nombre.pdf"
    // ----------------------------------------------------------------
    async descargarArchivo(fileId, res) {
        try {
            const rutaArchivo = path.join(UPLOADS_DIR, fileId);

            if (!rutaArchivo.startsWith(UPLOADS_DIR)) {
                throw Object.assign(new Error('Ruta no permitida'), { status: 403 });
            }
            if (!fs.existsSync(rutaArchivo)) {
                throw Object.assign(new Error('Archivo no encontrado en disco'), { status: 404 });
            }

            const stats    = fs.statSync(rutaArchivo);
            const nombre   = path.basename(rutaArchivo);
            const mimeType = this._inferirMimeType(nombre);

            res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
            res.setHeader('Content-Type', mimeType);
            res.setHeader('Content-Length', stats.size);

            fs.createReadStream(rutaArchivo).pipe(res);
        } catch (error) {
            console.error('Error descargando archivo:', error.message);
            if (!res.headersSent) {
                res.status(error.status || 500).json({ success: false, error: error.message });
            }
        }
    }

    // ----------------------------------------------------------------
    // ELIMINAR por fileId relativo
    // ----------------------------------------------------------------
    async eliminarArchivo(fileId) {
        try {
            const rutaArchivo = path.join(UPLOADS_DIR, fileId);

            if (!rutaArchivo.startsWith(UPLOADS_DIR)) {
                throw Object.assign(new Error('Ruta no permitida'), { status: 403 });
            }
            if (!fs.existsSync(rutaArchivo)) {
                throw Object.assign(new Error('Archivo no encontrado'), { status: 404 });
            }

            fs.unlinkSync(rutaArchivo);
            return true;
        } catch (error) {
            console.error('Error eliminando archivo:', error.message);
            throw error;
        }
    }

    // ----------------------------------------------------------------
    // LISTAR → retorna DocumentoModel[] con urlPublica
    // ----------------------------------------------------------------
    async listarArchivos(carpeta = 'documentos') {
        try {
            const rutaCarpeta = this._resolverRuta(carpeta);

            if (!fs.existsSync(rutaCarpeta)) return [];

            return fs.readdirSync(rutaCarpeta)
                .filter(nombre => fs.statSync(path.join(rutaCarpeta, nombre)).isFile())
                .map(nombre => {
                    const rutaArchivo = path.join(rutaCarpeta, nombre);
                    const stats       = fs.statSync(rutaArchivo);

                    return DocumentoModel.fromStat({
                        carpeta,
                        nombre,
                        mimeType: this._inferirMimeType(nombre),
                        stats,
                        baseUrl : URL_PUBLICA,   // genera urlPublica en el modelo
                    });
                });
        } catch (error) {
            console.error('Error listando archivos:', error.message);
            throw error;
        }
    }

    // ----------------------------------------------------------------
    // OBTENER metadata de un archivo con urlPublica
    // ----------------------------------------------------------------
    async obtenerArchivo(fileId) {
        const rutaArchivo = path.join(UPLOADS_DIR, fileId);

        if (!rutaArchivo.startsWith(UPLOADS_DIR)) {
            throw Object.assign(new Error('Ruta no permitida'), { status: 403 });
        }
        if (!fs.existsSync(rutaArchivo)) {
            throw Object.assign(new Error('Archivo no encontrado en disco'), { status: 404 });
        }

        const stats   = fs.statSync(rutaArchivo);
        const nombre  = path.basename(rutaArchivo);
        const carpeta = fileId.split('/')[0];

        return DocumentoModel.fromStat({
            carpeta,
            nombre,
            mimeType: this._inferirMimeType(nombre),
            stats,
            path    : rutaArchivo,
            baseUrl : URL_PUBLICA,   // genera urlPublica en el modelo
        });
    }

    // ----------------------------------------------------------------
    // Helpers privados
    // ----------------------------------------------------------------
    _nombreSeguro(nombre) {
        const ext  = path.extname(nombre);
        const base = path.basename(nombre, ext)
            .replace(/[^a-zA-Z0-9._-]/g, '_')
            .substring(0, 100);
        return `${Date.now()}_${base}${ext}`;
    }

    _inferirMimeType(nombre) {
        const ext   = path.extname(nombre).toLowerCase();
        const tipos = {
            '.pdf' : 'application/pdf',
            '.doc' : 'application/msword',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            '.xls' : 'application/vnd.ms-excel',
            '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            '.png' : 'image/png',
            '.jpg' : 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif' : 'image/gif',
            '.txt' : 'text/plain',
            '.csv' : 'text/csv',
            '.zip' : 'application/zip',
        };
        return tipos[ext] || 'application/octet-stream';
    }
}

const localFileService = new LocalFileService();
export default localFileService;
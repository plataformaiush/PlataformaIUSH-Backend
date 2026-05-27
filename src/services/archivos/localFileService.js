import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import DocumentoModel from '../../models/archivos/documentoModel.js';
import cloudinaryFileService from './cloudinaryFileService.js';

const __filename  = fileURLToPath(import.meta.url);
const __dirname   = path.dirname(__filename);

const UPLOADS_DIR = path.join(__dirname, '../../uploads');
const CARPETAS    = ['documentos', 'imagenes'];

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
        console.log('✓ Servicio de archivos inicializado (Cloudinary)');
    }

    // ----------------------------------------------------------------
    // SUBIR → delega a Cloudinary
    // ----------------------------------------------------------------
    async subirArchivo({ nombre, mimeType, buffer, carpeta = 'documentos' }) {
        return cloudinaryFileService.subirArchivo({ nombre, mimeType, buffer, carpeta });
    }

    // ----------------------------------------------------------------
    // DESCARGAR
    // Si es URL de Cloudinary → redirect
    // Si es ruta local antigua → stream desde disco
    // ----------------------------------------------------------------
    async descargarArchivo(fileId, res) {
        if (fileId.startsWith('https://')) {
            return res.redirect(fileId);
        }

        // Archivo local (registros anteriores a Cloudinary)
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
            console.error('Error descargando archivo local:', error.message);
            if (!res.headersSent) {
                res.status(error.status || 500).json({ success: false, error: error.message });
            }
        }
    }

    // ----------------------------------------------------------------
    // ELIMINAR → delega a Cloudinary (o elimina local si es ruta antigua)
    // ----------------------------------------------------------------
    async eliminarArchivo(fileId) {
        if (fileId.startsWith('https://')) {
            return cloudinaryFileService.eliminarArchivo(fileId);
        }

        // Archivo local (registros anteriores a Cloudinary)
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
            console.error('Error eliminando archivo local:', error.message);
            throw error;
        }
    }

    // ----------------------------------------------------------------
    // Helper privado — inferir MIME desde extensión (solo para locales)
    // ----------------------------------------------------------------
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

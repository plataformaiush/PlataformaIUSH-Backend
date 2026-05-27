import { Readable } from 'stream';
import cloudinary from '../../config/cloudinary.js';

class CloudinaryFileService {

    // ----------------------------------------------------------------
    // SUBIR
    // Retorna objeto compatible con DocumentoModel.fromStat()
    // ----------------------------------------------------------------
    async subirArchivo({ nombre, mimeType, buffer, carpeta = 'documentos' }) {
        const publicId = `plataformaiush/${carpeta}/${Date.now()}_${this._nombreBase(nombre)}`;

        const result = await new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    public_id    : publicId,
                    resource_type: 'auto',
                    overwrite    : false,
                },
                (error, result) => {
                    if (error) reject(error);
                    else resolve(result);
                }
            );
            Readable.from(buffer).pipe(uploadStream);
        });

        return {
            id          : result.secure_url,
            name        : result.public_id.split('/').pop(),
            originalName: nombre,
            mimeType,
            size        : result.bytes,
            carpeta,
            createdTime : new Date(result.created_at),
            modifiedTime: new Date(result.created_at),
        };
    }

    // ----------------------------------------------------------------
    // ELIMINAR por public_id o secure_url
    // ----------------------------------------------------------------
    async eliminarArchivo(fileId) {
        const publicId = this._publicIdDesdeUrl(fileId);
        await cloudinary.uploader.destroy(publicId, { resource_type: 'raw',   invalidate: true }).catch(() => null);
        await cloudinary.uploader.destroy(publicId, { resource_type: 'image', invalidate: true }).catch(() => null);
    }

    // ----------------------------------------------------------------
    // DESCARGAR — redirige al cliente a la URL de Cloudinary
    // ----------------------------------------------------------------
    async descargarArchivo(fileId, res) {
        const url = fileId.startsWith('https://') ? fileId : this._urlDesdePublicId(fileId);
        res.redirect(url);
    }

    // ----------------------------------------------------------------
    // Helpers privados
    // ----------------------------------------------------------------
    _nombreBase(nombre) {
        return nombre
            .replace(/[^a-zA-Z0-9._-]/g, '_')
            .substring(0, 80);
    }

    _publicIdDesdeUrl(fileId) {
        if (!fileId.startsWith('https://')) return fileId;
        // https://res.cloudinary.com/<cloud>/image/upload/v123/plataformaiush/documentos/file.pdf
        // → plataformaiush/documentos/file  (sin extensión para raw, con extensión para image)
        const url  = new URL(fileId);
        const partes = url.pathname.split('/upload/');
        if (partes.length < 2) return fileId;
        const conVersion = partes[1]; // "v1234/plataformaiush/documentos/file.pdf"
        const sinVersion = conVersion.replace(/^v\d+\//, '');
        // Quitar extensión para Cloudinary destroy
        return sinVersion.replace(/\.[^/.]+$/, '');
    }

    _urlDesdePublicId(publicId) {
        return cloudinary.url(publicId, { secure: true, resource_type: 'auto' });
    }
}

const cloudinaryFileService = new CloudinaryFileService();
export default cloudinaryFileService;

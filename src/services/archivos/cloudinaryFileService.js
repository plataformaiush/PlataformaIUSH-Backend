import { Readable } from 'stream';
import cloudinary from '../../config/cloudinary.js';

class CloudinaryFileService {

    // ----------------------------------------------------------------
    // SUBIR
    // Retorna objeto compatible con DocumentoModel.fromStat()
    // ----------------------------------------------------------------
    async subirArchivo({ nombre, mimeType, buffer, carpeta = 'documentos' }) {
        const publicId     = `plataformaiush/${carpeta}/${Date.now()}_${this._nombreBase(nombre)}`;
        const resourceType = this._resolverResourceType(mimeType);

        const result = await new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    public_id    : publicId,
                    resource_type: resourceType,
                    access_mode  : 'public',
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
        const { publicId, resourceType } = this._publicIdDesdeUrl(fileId);
        await cloudinary.uploader.destroy(publicId, { resource_type: resourceType, invalidate: true });
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
    // Imágenes → 'image', todo lo demás (PDF, DOCX, TXT, ZIP…) → 'raw'
    _resolverResourceType(mimeType) {
        if (mimeType && mimeType.startsWith('image/')) return 'image';
        return 'raw';
    }

    _nombreBase(nombre) {
        return nombre
            .replace(/[^a-zA-Z0-9._-]/g, '_')
            .substring(0, 80);
    }

    _publicIdDesdeUrl(fileId) {
        if (!fileId.startsWith('https://')) return { publicId: fileId, resourceType: 'raw' };
        // https://res.cloudinary.com/<cloud>/{image|raw}/upload/v123/plataformaiush/...
        const url          = new URL(fileId);
        const segmentos    = url.pathname.split('/');
        // segmentos[2] es el resource_type: "image" o "raw"
        const resourceType = segmentos[2] === 'image' ? 'image' : 'raw';
        const partes       = url.pathname.split('/upload/');
        if (partes.length < 2) return { publicId: fileId, resourceType };
        const sinVersion   = partes[1].replace(/^v\d+\//, '');
        const publicId     = sinVersion.replace(/\.[^/.]+$/, '');
        return { publicId, resourceType };
    }

    _urlDesdePublicId(publicId) {
        return cloudinary.url(publicId, { secure: true, resource_type: 'auto' });
    }
}

const cloudinaryFileService = new CloudinaryFileService();
export default cloudinaryFileService;

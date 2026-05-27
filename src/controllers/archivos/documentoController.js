import path from 'path';
import { randomUUID } from 'crypto';
import localFileService from '../../services/archivos/localFileService.js';
import MaestroDocumento from '../../repositories/MaestroDocumento.js';
import TipoDocumento from '../../repositories/TipoDocumento.js';

const URL_PUBLICA = `${process.env.BASE_URL || 'http://localhost:3000'}/src/`;

const buildUrlPublica = (rutaDocumento) => {
    if (!rutaDocumento) return null;
    return `${URL_PUBLICA}uploads/${rutaDocumento}`;
};

class DocumentoController {

    // ------------------------------------------------------------------
    // GET /api/documentos
    // ------------------------------------------------------------------
    async listar(req, res) {
        try {
            const documentos = await MaestroDocumento.findAllActive();

            const data = documentos.map((doc) => ({
                ...doc,
                urlPublica: buildUrlPublica(doc.ruta_documento),
            }));

            res.json({ success: true, data, total: data.length });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    // ------------------------------------------------------------------
    // GET /api/documentos/:id
    // ------------------------------------------------------------------
    async obtener(req, res) {
        try {
            const { id } = req.params;

            const documento = await MaestroDocumento.findById(id);
            if (!documento) {
                return res.status(404).json({ success: false, error: 'Documento no encontrado' });
            }

            res.json({
                success: true,
                data: {
                    ...documento,
                    urlPublica: buildUrlPublica(documento.ruta_documento),
                },
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    // ------------------------------------------------------------------
    // GET /api/documentos/:id/descargar
    // ------------------------------------------------------------------
    async descargar(req, res) {
        try {
            const { id } = req.params;

            const documento = await MaestroDocumento.findById(id);
            if (!documento) {
                return res.status(404).json({
                    success: false,
                    error: 'Documento no encontrado en base de datos',
                });
            }

            await localFileService.descargarArchivo(documento.ruta_documento, res);

        } catch (error) {
            if (!res.headersSent) {
                res.status(error.status || 500).json({ success: false, error: error.message });
            }
        }
    }

    // ------------------------------------------------------------------
    // POST /api/documentos
    // ------------------------------------------------------------------
    async subir(req, res) {
        try {
            if (!req.file) {
                return res.status(400).json({ success: false, error: 'No se envió ningún archivo' });
            }

            const { originalname, mimetype, buffer, size } = req.file;
            const { carpeta = 'documentos' } = req.body;

            const extension     = path.extname(originalname);
            const tipoDocumento = await TipoDocumento.findByExtension(extension);

            const archivoLocal = await localFileService.subirArchivo({
                nombre  : originalname,
                mimeType: mimetype,
                buffer,
                carpeta,
            });

            const maestro = new MaestroDocumento({
                id_maestro_documento : randomUUID(),
                numero_documento     : originalname,
                id_tipo_documento    : tipoDocumento.id_tipo_documento,
                ruta_documento       : archivoLocal.id,
                tamanno              : size,
                activo               : true,
            });

            const maestroGuardado = await maestro.insert();

            res.status(201).json({
                success: true,
                data: {
                    ...maestroGuardado.toJSON(),
                    tipo_extension: tipoDocumento.nombre,
                    archivo       : archivoLocal,
                },
            });

        } catch (error) {
            console.error('Error subiendo documento:', error.message);
            res.status(500).json({ success: false, error: error.message });
        }
    }

    // ------------------------------------------------------------------
    // DELETE /api/documentos/:id
    // ------------------------------------------------------------------
    async eliminar(req, res) {
        try {
            const { id } = req.params;

            const documento = await MaestroDocumento.findById(id);
            if (!documento) {
                return res.status(404).json({ success: false, error: 'Documento no encontrado' });
            }

            await MaestroDocumento.delete(id);

            try {
                await localFileService.eliminarArchivo(documento.ruta_documento);
            } catch (fsError) {
                console.warn('Aviso: no se pudo eliminar el archivo físico:', fsError.message);
            }

            res.json({ success: true, mensaje: 'Documento eliminado correctamente' });

        } catch (error) {
            res.status(error.status || 500).json({ success: false, error: error.message });
        }
    }
}

export default new DocumentoController();
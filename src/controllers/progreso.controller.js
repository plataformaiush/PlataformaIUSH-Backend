import * as ProgresoModel from '../models/progreso.model.js';
import { generateCertificadoAutomatico } from '../services/CertificateService.js';

export const completarContenido = async (req, res, next) => {
    try {
        const { idContenido } = req.params;

        // 👇 Buscamos el id_usuario en el body (o como respaldo en el token)
        const { id_usuario: idUsuarioBody } = req.body;
        const usuarioLogueado = req.user || req.usuario;

        const id_usuario = idUsuarioBody || usuarioLogueado?.id_usuario || usuarioLogueado?.id;

        if (!id_usuario) {
            return res.status(400).json({
                success: false,
                message: 'El id_usuario es requerido (envíalo en el body).'
            });
        }

        if (!idContenido) {
            return res.status(400).json({ success: false, message: 'El ID del contenido es requerido.' });
        }

        const resultado = await ProgresoModel.marcarContenidoComoVisto(id_usuario, idContenido);

        let certificado = null;
        if (resultado.cursoCompletado && resultado.idCurso) {
            certificado = await generateCertificadoAutomatico(id_usuario, resultado.idCurso)
                .catch(() => null); // no interrumpir la respuesta si ya existe el certificado
        }

        return res.status(200).json({
            success: true,
            message: resultado.message,
            data: {
                actualizado: resultado.actualizado,
                porcentajeActual: resultado.nuevoPorcentaje,
                completado: resultado.cursoCompletado,
                certificado,
            }
        });

    } catch (error) {
        if (error.message === 'Contenido no encontrado') {
            return res.status(404).json({ success: false, message: error.message });
        }
        console.error('Error al completar contenido:', error);
        next(error);
    }
};
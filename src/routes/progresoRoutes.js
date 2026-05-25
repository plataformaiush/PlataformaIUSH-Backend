import { Router } from 'express';
import * as progresoController    from '../controllers/grades/ProgresoController.js';
import * as validacionController  from '../controllers/grades/ValidacionController.js';
import authenticate               from '../middleware/auth.js';
import { authorize, ROLES }       from '../middleware/roleGuard.js';
import * as ProgresoController from "../controllers/progreso.controller.js";

const router = Router();

router.post(
  '/contenido/:id/validar',
  authenticate,
  authorize(ROLES.ESTUDIANTE, ROLES.ADMIN, ROLES.SUPER_ADMIN),
  validacionController.validarRespuesta
);

router.get(
  '/mis-cursos',
  authenticate,
  authorize(ROLES.ESTUDIANTE, ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.DOCENTE),
  progresoController.getMisCursos
);

router.get(
  '/estadisticas/global',
  authenticate,
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN),
  progresoController.getEstadisticasGlobal
);

router.get(
  '/estadisticas/curso/:id',
  authenticate,
  authorize(ROLES.DOCENTE, ROLES.ADMIN, ROLES.SUPER_ADMIN),
  progresoController.getEstadisticasCurso
);

router.get(
  '/curso/:id_curso/todos',
  authenticate,
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.DOCENTE),
  progresoController.getProgresoCursoTodos
);

router.get(
  '/curso/:id_curso/modulos',
  authenticate,
  authorize(ROLES.ESTUDIANTE, ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.DOCENTE),
  progresoController.getProgresoDetalleModulos
);

router.get(
  '/curso/:id_curso',
  authenticate,
  authorize(ROLES.ESTUDIANTE, ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.DOCENTE),
  progresoController.getProgresoCurso
);

/**
 * @swagger
 * /progreso/contenido/{idContenido}/completar:
 *   post:
 *     summary: Marca un contenido como completado y actualiza el progreso del curso
 *     tags: [Progreso]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: idContenido
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID del contenido a marcar como completado
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - id_usuario
 *             properties:
 *               id_usuario:
 *                 type: string
 *                 format: uuid
 *                 description: ID del usuario que completa el contenido
 *                 example: "422816f9-46b7-407b-b255-9fde0b83482a"
 *     responses:
 *       200:
 *         description: Contenido marcado como completado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     actualizado:
 *                       type: boolean
 *                     porcentajeActual:
 *                       type: number
 *                     completado:
 *                       type: boolean
 */
router.post(
    '/sincronizar',
    authenticate,
    authorize(ROLES.ESTUDIANTE, ROLES.ADMIN, ROLES.SUPER_ADMIN),
    ProgresoController.sincronizarProgreso
);

router.post(
    '/contenido/:idContenido/completar',
    authenticate,
    authorize(ROLES.ESTUDIANTE, ROLES.SUPER_ADMIN, ROLES.ADMIN),
    ProgresoController.completarContenido
);

export default router;

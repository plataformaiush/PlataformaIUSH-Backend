// src/controllers/curso.controller.js
import * as CursoModel      from '../models/curso.model.js';
import * as InscripcionModel from '../models/inscripcion.model.js';
import { ROLES }             from '../config/constants.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Formateadores ─────────────────────────────────────────────
const fmt = (c) => ({
  idCurso:       c.id_curso,
  idUsuario:     c.id_usuario,
  titulo:        c.titulo,
  descripcion:   c.descripcion ?? null,
  activo:        c.activo,
  idImagen:      c.id_imagen ?? null,
  modulosCount:  parseInt(c.modulos_count ?? '0', 10),
  creacion:      c.creacion,
  actualizacion: c.actualizacion,
  ...(c.nombre_usuario && { nombreUsuario: c.nombre_usuario }),
});

const fmtModulo = (m) => ({
  idModulo:        m.id_modulo,
  titulo:          m.titulo,
  descripcion:     m.descripcion ?? null,
  activo:          m.activo,
  orden:           m.orden,
  contenidosCount: parseInt(m.contenidos_count ?? '0', 10),
  creacion:        m.creacion,
});

const fmtContenidoDetallado = (c) => ({
  idContenido:   c.idContenido,
  titulo:        c.titulo,
  descripcion:   c.descripcion,
  tipo:          c.tipo,
  url_o_texto:   c.url_o_texto,
  orden:         c.orden,
  activo:        c.activo,
  creacion:      c.creacion,
  actualizacion: c.actualizacion,
  completado:    c.completado,
  completadoEn:  c.completadoEn,
});

const fmtModuloDetallado = (m) => ({
  idModulo:              m.idModulo,
  titulo:                m.titulo,
  descripcion:           m.descripcion,
  activo:                m.activo,
  orden:                 m.orden,
  creacion:              m.creacion,
  actualizacion:         m.actualizacion,
  contenidosCompletados: m.contenidosCompletados,
  totalContenidos:       m.totalContenidos,
  porcentaje:            m.porcentaje,
  contenidos:            m.contenidos.map(fmtContenidoDetallado),
});

const fmtProgresoCursoDetallado = (p) => ({
  idProgresoCurso:       p.id_progreso_curso,
  idUsuario:             p.id_usuario,
  idCurso:               p.id_curso,
  porcentaje:            Number(p.porcentaje ?? 0),
  contenidosCompletados: Number(p.contenidos_completados ?? 0),
  totalContenidos:       Number(p.total_contenidos ?? 0),
  completado:            Boolean(p.completado),
  aprobado:              Boolean(p.aprobado),
  fechaInicio:           p.fecha_inicio ?? null,
  fechaCompletado:       p.fecha_completado ?? null,
});

// ── Helper: resuelve qué cursos puede listar el usuario ───────
// Docente    → solo sus propios cursos
// Admin      → sus cursos propios + cursos de docentes que él creó
// SuperAdmin → todos los cursos
const resolverFiltroUsuario = async (user) => {
  if (user.role === ROLES.DOCENTE) {
    return { id_usuario: user.userId };
  }
  if (user.role === ROLES.ADMIN) {
    const ids = await CursoModel.findDocentesDeAdmin(user.userId);
    // Incluir el propio admin + sus docentes
    return { ids_usuarios: [...ids, user.userId] };
  }
  // SuperAdmin: sin filtro
  return {};
};

// ── Helper: verifica si el usuario puede operar sobre un curso ─
// Docente    → solo si el curso le pertenece
// Admin      → si el curso es suyo o de un docente que él creó
// SuperAdmin → siempre puede
const verificarAcceso = async (user, curso) => {
  if (user.role === ROLES.SUPER_ADMIN) {
    return { permitido: true };
  }

  if (user.role === ROLES.DOCENTE) {
    if (user.userId !== curso.id_usuario) {
      return { permitido: false, mensaje: 'Solo el docente asignado al curso puede realizar esta acción.' };
    }
    return { permitido: true };
  }

  if (user.role === ROLES.ADMIN) {
    // Puede si el curso es suyo directamente
    if (curso.id_usuario === user.userId) {
      return { permitido: true };
    }
    // O si pertenece a un docente que él creó
    const idsDocentes = await CursoModel.findDocentesDeAdmin(user.userId);
    if (idsDocentes.includes(curso.id_usuario)) {
      return { permitido: true };
    }
    return { permitido: false, mensaje: 'El administrador solo puede gestionar cursos propios o de los docentes que ha creado.' };
  }

  return { permitido: false, mensaje: 'No tiene permisos para realizar esta acción.' };
};

// ── GET /api/cursos ───────────────────────────────────────────
export const getAll = async (req, res, next) => {
  try {
    const { activo, page, limit } = req.query;

    if (activo !== undefined && activo !== 'true' && activo !== 'false') {
      return res.status(400).json({ success: false, message: 'El campo activo debe ser "true" o "false".' });
    }
    if (page  !== undefined && (isNaN(parseInt(page,  10)) || parseInt(page,  10) < 1)) {
      return res.status(400).json({ success: false, message: 'El campo page debe ser un número entero mayor a 0.' });
    }
    if (limit !== undefined && (isNaN(parseInt(limit, 10)) || parseInt(limit, 10) < 1)) {
      return res.status(400).json({ success: false, message: 'El campo limit debe ser un número entero mayor a 0.' });
    }

    const filtroRol = await resolverFiltroUsuario(req.user);

    const result = await CursoModel.findAll({
      activo: activo !== undefined ? activo === 'true' : undefined,
      ...filtroRol,
      page:  page  ?? 1,
      limit: limit ?? 10,
    });

    return res.status(200).json({
      success: true,
      data:    result.data.map(fmt),
      meta: {
        total:      result.total,
        page:       result.page,
        limit:      result.limit,
        totalPages: result.totalPages,
      },
    });
  } catch (err) { next(err); }
};

// ── GET /api/cursos/:id ───────────────────────────────────────
export const getById = async (req, res, next) => {
  try {
    const curso = await CursoModel.findById(req.params.id);

    if (!curso) {
      return res.status(404).json({ success: false, message: 'Curso no encontrado.' });
    }

    const acceso = await verificarAcceso(req.user, curso);
    if (!acceso.permitido) {
      return res.status(403).json({ success: false, message: acceso.mensaje });
    }

    return res.status(200).json({
      success: true,
      data: {
        ...fmt({ ...curso, modulos_count: String(curso.modulos?.length ?? 0) }),
        modulos: (curso.modulos ?? []).map(fmtModulo),
      },
    });
  } catch (err) { next(err); }
};

// ── GET /api/cursos/:id/detalle/:id_usuario ───────────────────
export const getDetalleCompleto = async (req, res, next) => {
  try {
    const { id, id_usuario } = req.params;
    const usuario = req.user;

    if (!UUID_REGEX.test(id)) {
      return res.status(400).json({ success: false, message: 'ID de curso inválido.' });
    }
    if (!UUID_REGEX.test(id_usuario)) {
      return res.status(400).json({ success: false, message: 'ID de usuario inválido.' });
    }

    const esStaff = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DOCENTE].includes(usuario.role);

    const detalle = await CursoModel.findDetalleCompleto(id, id_usuario);

    if (!detalle) {
      return res.status(404).json({ success: false, message: 'Curso no encontrado.' });
    }

    if (!esStaff) {
      const inscrito = await InscripcionModel.exists(id, id_usuario);
      if (!inscrito) {
        return res.status(403).json({ success: false, message: 'El usuario no está inscrito en este curso.' });
      }
    }

    const progresoCurso = fmtProgresoCursoDetallado(detalle.progresoCurso);
    const modulos       = detalle.modulos.map(fmtModuloDetallado);

    return res.status(200).json({
      success: true,
      data: {
        curso: fmt({ ...detalle.curso, modulos_count: String(modulos.length) }),
        progresoCurso,
        modulos,
      },
    });
  } catch (err) { next(err); }
};

// ── POST /api/cursos ──────────────────────────────────────────
export const create = async (req, res, next) => {
  try {
    const { titulo, descripcion, id_usuario, id_imagen } = req.body;

    if (!titulo || typeof titulo !== 'string' || titulo.trim() === '') {
      return res.status(400).json({ success: false, message: 'El campo titulo es requerido.' });
    }
    if (!id_usuario) {
      return res.status(400).json({ success: false, message: 'El campo id_usuario es requerido.' });
    }
    if (!UUID_REGEX.test(id_usuario)) {
      return res.status(400).json({ success: false, message: 'El campo id_usuario debe ser un UUID válido.' });
    }

    // Docente solo puede crear cursos para sí mismo
    if (req.user.role === ROLES.DOCENTE && req.user.userId !== id_usuario) {
      return res.status(403).json({ success: false, message: 'Un docente solo puede crear cursos asignados a sí mismo.' });
    }

    if (id_imagen !== undefined && id_imagen !== null && !UUID_REGEX.test(id_imagen)) {
      return res.status(400).json({ success: false, message: 'El campo id_imagen debe ser un UUID válido.' });
    }

    const curso = await CursoModel.create({
      id_usuario,
      titulo:      titulo.trim(),
      descripcion,
      id_imagen,
    });

    return res.status(201).json({ success: true, data: fmt({ ...curso, modulos_count: '0' }) });
  } catch (err) { next(err); }
};

// ── PUT /api/cursos/:id ───────────────────────────────────────
export const update = async (req, res, next) => {
  try {
    const { titulo, descripcion, id_usuario, id_imagen } = req.body;

    if (titulo === undefined && descripcion === undefined && id_usuario === undefined && id_imagen === undefined) {
      return res.status(400).json({ success: false, message: 'Envíe al menos un campo: titulo, descripcion, id_usuario o id_imagen.' });
    }
    if (titulo !== undefined && (typeof titulo !== 'string' || titulo.trim() === '')) {
      return res.status(400).json({ success: false, message: 'El campo titulo no puede estar vacío.' });
    }
    if (id_usuario !== undefined && !UUID_REGEX.test(id_usuario)) {
      return res.status(400).json({ success: false, message: 'El campo id_usuario debe ser un UUID válido.' });
    }
    if (id_imagen !== undefined && id_imagen !== null && !UUID_REGEX.test(id_imagen)) {
      return res.status(400).json({ success: false, message: 'El campo id_imagen debe ser un UUID válido.' });
    }

    const curso = await CursoModel.findById(req.params.id);
    if (!curso) {
      return res.status(404).json({ success: false, message: 'Curso no encontrado.' });
    }

    const acceso = await verificarAcceso(req.user, curso);
    if (!acceso.permitido) {
      return res.status(403).json({ success: false, message: acceso.mensaje });
    }

    const updated = await CursoModel.update(req.params.id, {
      titulo: titulo?.trim(),
      descripcion,
      id_usuario,
      id_imagen,
    });

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Curso no encontrado.' });
    }

    return res.status(200).json({ success: true, data: fmt({ ...updated, modulos_count: '0' }) });
  } catch (err) { next(err); }
};

// ── PATCH /api/cursos/:id/activo ──────────────────────────────
export const toggleActivo = async (req, res, next) => {
  try {
    const { activo } = req.body;

    if (activo === undefined || activo === null) {
      return res.status(400).json({ success: false, message: 'El campo activo es requerido.' });
    }
    if (typeof activo !== 'boolean') {
      return res.status(400).json({ success: false, message: 'El campo activo debe ser true o false.' });
    }

    const curso = await CursoModel.findById(req.params.id);
    if (!curso) return res.status(404).json({ success: false, message: 'Curso no encontrado.' });

    const acceso = await verificarAcceso(req.user, curso);
    if (!acceso.permitido) {
      return res.status(403).json({ success: false, message: acceso.mensaje });
    }

    if (curso.activo === activo) {
      return res.status(409).json({ success: false, message: `El curso ya se encuentra ${activo ? 'activo' : 'inactivo'}.` });
    }

    const updated = await CursoModel.toggleActivo(req.params.id, activo);
    return res.status(200).json({
      success: true,
      message: `Curso ${activo ? 'activado' : 'desactivado'} exitosamente.`,
      data: { idCurso: updated.id_curso, activo: updated.activo, actualizacion: updated.actualizacion },
    });
  } catch (err) { next(err); }
};

// ── DELETE /api/cursos/:id ────────────────────────────────────
export const remove = async (req, res, next) => {
  try {
    const curso = await CursoModel.findById(req.params.id);
    if (!curso) return res.status(404).json({ success: false, message: 'Curso no encontrado.' });

    const acceso = await verificarAcceso(req.user, curso);
    if (!acceso.permitido) {
      return res.status(403).json({ success: false, message: acceso.mensaje });
    }

    const deleted = await CursoModel.softDelete(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, message: 'Curso no encontrado.' });

    return res.status(200).json({ success: true, message: 'Curso eliminado exitosamente.', eliminacion: deleted.eliminacion });
  } catch (err) { next(err); }
};
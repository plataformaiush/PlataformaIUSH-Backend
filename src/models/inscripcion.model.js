// src/models/inscripcion.model.js
import pool from '../database/db.js';

export const findAll = async ({ id_curso, id_usuario, page = 1, limit = 10 } = {}) => {
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;

  const values = [];
  const conditions = [];

  if (id_curso)   { values.push(id_curso);   conditions.push(`i.id_curso = $${values.length}`); }
  if (id_usuario) { values.push(id_usuario); conditions.push(`i.id_usuario = $${values.length}`); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const dataQuery = `
    SELECT id_inscripcion, id_curso, id_usuario, fecha_inicio, fecha_finalizacion
    FROM inscripcion i
    ${where}
    ORDER BY fecha_inicio DESC NULLS LAST
    LIMIT $${values.length + 1} OFFSET $${values.length + 2}
  `;

  const countQuery = `
    SELECT COUNT(*) AS total FROM inscripcion i
    ${where}
  `;

  const [dataResult, countResult] = await Promise.all([
    pool.query(dataQuery, [...values, limitNum, offset]),
    pool.query(countQuery, values),
  ]);

  return {
    data: dataResult.rows,
    total: parseInt(countResult.rows[0]?.total ?? '0', 10),
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(parseInt(countResult.rows[0]?.total ?? '0', 10) / limitNum),
  };
};

export const findById = async (id_inscripcion) => {
  const query = `
    SELECT id_inscripcion, id_curso, id_usuario, fecha_inicio, fecha_finalizacion
    FROM inscripcion
    WHERE id_inscripcion = $1
  `;
  const result = await pool.query(query, [id_inscripcion]);
  return result.rows[0] ?? null;
};

export const exists = async (id_curso, id_usuario) => {
  const query = `
    SELECT 1 FROM inscripcion WHERE id_curso = $1 AND id_usuario = $2 LIMIT 1
  `;
  const result = await pool.query(query, [id_curso, id_usuario]);
  return result.rows.length > 0;
};

export const create = async ({ id_curso, id_usuario, fecha_inicio, fecha_finalizacion }) => {
  const query = `
    INSERT INTO inscripcion (id_curso, id_usuario, fecha_inicio, fecha_finalizacion)
    VALUES ($1, $2, $3, $4)
    RETURNING id_inscripcion, id_curso, id_usuario, fecha_inicio, fecha_finalizacion
  `;
  const result = await pool.query(query, [id_curso, id_usuario, fecha_inicio ?? null, fecha_finalizacion ?? null]);
  return result.rows[0];
};

export const update = async (id_inscripcion, { fecha_inicio, fecha_finalizacion }) => {
  const fields = [];
  const values = [];

  if (fecha_inicio !== undefined)       { values.push(fecha_inicio);       fields.push(`fecha_inicio = $${values.length}`); }
  if (fecha_finalizacion !== undefined) { values.push(fecha_finalizacion); fields.push(`fecha_finalizacion = $${values.length}`); }

  if (fields.length === 0) return null;

  values.push(id_inscripcion);
  const query = `
    UPDATE inscripcion SET ${fields.join(', ')}
    WHERE id_inscripcion = $${values.length}
    RETURNING id_inscripcion, id_curso, id_usuario, fecha_inicio, fecha_finalizacion
  `;
  const result = await pool.query(query, values);
  return result.rows[0] ?? null;
};

export const remove = async (id_inscripcion) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const ins = await client.query(
      `SELECT id_usuario, id_curso FROM inscripcion WHERE id_inscripcion = $1`,
      [id_inscripcion]
    );
    if (ins.rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    const { id_usuario, id_curso } = ins.rows[0];

    await client.query(
      `DELETE FROM progreso_estudiante WHERE id_usuario = $1 AND id_curso = $2`,
      [id_usuario, id_curso]
    );

    await client.query(
      `DELETE FROM progreso_curso WHERE id_usuario = $1 AND id_curso = $2`,
      [id_usuario, id_curso]
    );

    const result = await client.query(
      `DELETE FROM inscripcion WHERE id_inscripcion = $1 RETURNING id_inscripcion`,
      [id_inscripcion]
    );

    await client.query('COMMIT');
    return result.rows[0] ?? null;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export const findCursosInscritosPorUsuario = async (id_usuario) => {
  const query = `
    SELECT
      i.id_inscripcion,
      i.fecha_inicio AS inscripcion_fecha_inicio,
      i.fecha_finalizacion AS inscripcion_fecha_finalizacion,
      c.id_curso,
      c.id_usuario AS id_creador_curso,
      c.titulo,
      c.descripcion,
      c.activo AS curso_activo,
      c.creacion AS curso_creacion,
      -- Usa progreso_curso si existe; si no, calcula en tiempo real desde progreso_estudiante
      COALESCE(
        p.porcentaje,
        CASE WHEN ct.total > 0
          THEN LEAST(ROUND((COALESCE(pe.completados, 0)::numeric / ct.total) * 100, 2), 100)
          ELSE 0
        END
      ) AS porcentaje_progreso,
      COALESCE(p.contenidos_completados, COALESCE(pe.completados, 0)) AS contenidos_completados,
      COALESCE(p.total_contenidos, ct.total, 0)                       AS modulos_total,
      COALESCE(p.completado, ct.total > 0 AND COALESCE(pe.completados, 0) >= ct.total, false) AS completado,
      COALESCE(p.aprobado,   false)                                    AS aprobado
    FROM inscripcion i
    INNER JOIN curso c ON i.id_curso = c.id_curso
    LEFT JOIN progreso_curso p
           ON p.id_curso  = c.id_curso AND p.id_usuario = i.id_usuario
    -- Conteo real de contenidos completados por el estudiante en este curso
    LEFT JOIN (
      SELECT id_usuario, id_curso, COUNT(*)::int AS completados
        FROM progreso_estudiante
       GROUP BY id_usuario, id_curso
    ) pe ON pe.id_usuario = i.id_usuario AND pe.id_curso = c.id_curso
    -- Total de contenidos del curso (excluye eliminados, incluye inactivos)
    LEFT JOIN (
      SELECT m.id_curso, COUNT(cn.id_contenido)::int AS total
        FROM contenido cn
        JOIN modulo   m  ON cn.id_modulo = m.id_modulo
       WHERE cn.eliminacion IS NULL AND m.eliminacion IS NULL
       GROUP BY m.id_curso
    ) ct ON ct.id_curso = c.id_curso
    WHERE i.id_usuario = $1
      AND c.eliminacion IS NULL
    ORDER BY i.fecha_inicio DESC
  `;

  const result = await pool.query(query, [id_usuario]);
  return result.rows;
};


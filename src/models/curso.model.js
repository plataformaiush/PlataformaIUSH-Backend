// src/models/curso.model.js
import pool from '../database/db.js';

// ── Queries ───────────────────────────────────────────────────

export const findAll = async ({ activo, id_usuario, ids_usuarios, page = 1, limit = 10 } = {}) => {
  const pageNum  = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset   = (pageNum - 1) * limitNum;

  const values     = [];
  const conditions = ['c.eliminacion IS NULL'];

  if (activo !== undefined) {
    values.push(activo);
    conditions.push(`c.activo = $${values.length}`);
  }

  // Filtro exacto por un usuario (docente filtrando sus propios cursos)
  if (id_usuario) {
    values.push(id_usuario);
    conditions.push(`c.id_usuario = $${values.length}`);
  }

  // Filtro por lista de usuarios (admin filtrando cursos de sus docentes)
  if (ids_usuarios && ids_usuarios.length > 0) {
    values.push(ids_usuarios);
    conditions.push(`c.id_usuario = ANY($${values.length})`);
  }

  const where = conditions.join(' AND ');

  const dataQuery = `
    SELECT
      c.id_curso, c.id_usuario, c.titulo, c.descripcion, c.activo,
      c.id_imagen,
      c.creacion, c.actualizacion,
      COUNT(m.id_modulo) FILTER (WHERE m.eliminacion IS NULL) AS modulos_count
    FROM curso c
    LEFT JOIN modulo m ON m.id_curso = c.id_curso
    WHERE ${where}
    GROUP BY c.id_curso
    ORDER BY c.creacion DESC
    LIMIT $${values.length + 1} OFFSET $${values.length + 2}
  `;

  const countQuery = `
    SELECT COUNT(*) AS total
    FROM curso c
    WHERE ${where}
  `;

  const [dataResult, countResult] = await Promise.all([
    pool.query(dataQuery, [...values, limitNum, offset]),
    pool.query(countQuery, values),
  ]);

  return {
    data:       dataResult.rows,
    total:      parseInt(countResult.rows[0].total, 10),
    page:       pageNum,
    limit:      limitNum,
    totalPages: Math.ceil(parseInt(countResult.rows[0].total, 10) / limitNum),
  };
};

export const findById = async (id_curso) => {
  const cursoQuery = `
    SELECT id_curso, id_usuario, titulo, descripcion, activo, id_imagen, creacion, actualizacion
    FROM curso
    WHERE id_curso = $1 AND eliminacion IS NULL
  `;

  const modulosQuery = `
    SELECT
      m.id_modulo,
      m.titulo,
      m.descripcion,
      m.activo,
      m.orden,
      m.creacion,
      COUNT(c.id_contenido) FILTER (WHERE c.eliminacion IS NULL) AS contenidos_count
    FROM modulo m
    LEFT JOIN contenido c ON c.id_modulo = m.id_modulo
    WHERE m.id_curso = $1 AND m.eliminacion IS NULL
    GROUP BY m.id_modulo
    ORDER BY m.orden ASC
  `;

  const [cursoResult, modulosResult] = await Promise.all([
    pool.query(cursoQuery, [id_curso]),
    pool.query(modulosQuery, [id_curso]),
  ]);

  if (cursoResult.rows.length === 0) return null;

  return { ...cursoResult.rows[0], modulos: modulosResult.rows };
};

export const findDetalleCompleto = async (id_curso, id_usuario) => {
  const cursoQuery = `
    SELECT c.id_curso, c.id_usuario, c.titulo, c.descripcion, c.activo,
           c.id_imagen, c.creacion, c.actualizacion,
           u.nombre AS nombre_usuario
    FROM curso c
    LEFT JOIN usuario u ON c.id_usuario = u.id_usuario
    WHERE c.id_curso = $1 AND c.eliminacion IS NULL
  `;

  const progresoQuery = `
    SELECT id_progreso_curso, id_usuario, id_curso, porcentaje, contenidos_completados,
           total_contenidos, completado, aprobado, fecha_inicio, fecha_completado
    FROM progreso_curso
    WHERE id_usuario = $2 AND id_curso = $1
  `;

  const estructuraQuery = `
    SELECT
      m.id_modulo,
      m.titulo AS modulo_titulo,
      m.descripcion AS modulo_descripcion,
      m.activo AS modulo_activo,
      m.orden AS modulo_orden,
      m.creacion AS modulo_creacion,
      m.actualizacion AS modulo_actualizacion,
      c.id_contenido,
      c.titulo AS contenido_titulo,
      c.descripcion AS contenido_descripcion,
      c.tipo AS contenido_tipo,
      c.url_o_texto,
      c.orden AS contenido_orden,
      c.activo AS contenido_activo,
      c.creacion AS contenido_creacion,
      c.actualizacion AS contenido_actualizacion,
      pe.completado AS contenido_completado,
      pe.completado_en AS contenido_completado_en
    FROM modulo m
    LEFT JOIN contenido c
      ON c.id_modulo = m.id_modulo AND c.eliminacion IS NULL
    LEFT JOIN progreso_estudiante pe
      ON pe.id_contenido = c.id_contenido AND pe.id_usuario = $2
    WHERE m.id_curso = $1 AND m.eliminacion IS NULL
    ORDER BY m.orden ASC, c.orden ASC
  `;

  const [cursoResult, progresoResult, estructuraResult] = await Promise.all([
    pool.query(cursoQuery, [id_curso]),
    pool.query(progresoQuery, [id_curso, id_usuario]),
    pool.query(estructuraQuery, [id_curso, id_usuario]),
  ]);

  if (cursoResult.rows.length === 0) return null;

  const modulosMap = new Map();
  let totalContenidos = 0;

  for (const row of estructuraResult.rows) {
    if (!modulosMap.has(row.id_modulo)) {
      modulosMap.set(row.id_modulo, {
        idModulo: row.id_modulo,
        titulo: row.modulo_titulo,
        descripcion: row.modulo_descripcion ?? null,
        activo: row.modulo_activo,
        orden: row.modulo_orden,
        creacion: row.modulo_creacion,
        actualizacion: row.modulo_actualizacion,
        contenidos: [],
      });
    }

    if (row.id_contenido) {
      const modulo = modulosMap.get(row.id_modulo);
      modulo.contenidos.push({
        idContenido: row.id_contenido,
        titulo: row.contenido_titulo,
        descripcion: row.contenido_descripcion ?? null,
        tipo: row.contenido_tipo,
        url_o_texto: row.url_o_texto,
        orden: row.contenido_orden,
        activo: row.contenido_activo,
        creacion: row.contenido_creacion,
        actualizacion: row.contenido_actualizacion,
        completado: row.contenido_completado ?? false,
        completadoEn: row.contenido_completado_en ?? null,
      });
      totalContenidos += 1;
    }
  }

  const modulos = Array.from(modulosMap.values()).map((modulo) => {
    const contenidosCompletados = modulo.contenidos.filter((c) => c.completado).length;
    const total = modulo.contenidos.length;
    return {
      ...modulo,
      contenidosCompletados,
      totalContenidos: total,
      porcentaje: total > 0 ? Number(((contenidosCompletados / total) * 100).toFixed(2)) : 0,
    };
  });

  const progresoCurso = progresoResult.rows[0] ?? {
    id_progreso_curso: null,
    id_usuario,
    id_curso,
    porcentaje: 0,
    contenidos_completados: 0,
    total_contenidos: totalContenidos,
    completado: false,
    aprobado: false,
    fecha_inicio: null,
    fecha_completado: null,
  };

  return { curso: cursoResult.rows[0], progresoCurso, modulos, totalContenidos };
};

// Obtiene los ids de docentes creados por un admin
export const findDocentesDeAdmin = async (id_admin) => {
  const result = await pool.query(
    `SELECT id_usuario FROM usuario WHERE creado_por = $1`,
    [id_admin]
  );
  return result.rows.map(r => r.id_usuario);
};

export const create = async ({ id_usuario, titulo, descripcion, id_imagen }) => {
  const query = `
    INSERT INTO curso (id_usuario, titulo, descripcion, activo, id_imagen)
    VALUES ($1, $2, $3, TRUE, $4)
    RETURNING id_curso, id_usuario, titulo, descripcion, activo, id_imagen, creacion, actualizacion
  `;
  const result = await pool.query(query, [id_usuario, titulo, descripcion ?? null, id_imagen ?? null]);
  return result.rows[0];
};

export const update = async (id_curso, { titulo, descripcion, id_usuario, id_imagen }) => {
  const fields = [];
  const values = [];

  if (titulo      !== undefined) { values.push(titulo);      fields.push(`titulo = $${values.length}`);      }
  if (descripcion !== undefined) { values.push(descripcion); fields.push(`descripcion = $${values.length}`); }
  if (id_usuario  !== undefined) { values.push(id_usuario);  fields.push(`id_usuario = $${values.length}`);  }
  if (id_imagen   !== undefined) { values.push(id_imagen);   fields.push(`id_imagen = $${values.length}`);   }

  if (fields.length === 0) return null;

  values.push(id_curso);
  const query = `
    UPDATE curso SET ${fields.join(', ')}
    WHERE id_curso = $${values.length} AND eliminacion IS NULL
    RETURNING id_curso, id_usuario, titulo, descripcion, activo, id_imagen, creacion, actualizacion
  `;
  const result = await pool.query(query, values);
  return result.rows[0] ?? null;
};

export const toggleActivo = async (id_curso, activo) => {
  const query = `
    UPDATE curso SET activo = $1
    WHERE id_curso = $2 AND eliminacion IS NULL
    RETURNING id_curso, activo, actualizacion
  `;
  const result = await pool.query(query, [activo, id_curso]);
  return result.rows[0] ?? null;
};

export const softDelete = async (id_curso) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE contenido SET eliminacion = NOW()
       WHERE id_modulo IN (
         SELECT id_modulo FROM modulo WHERE id_curso = $1 AND eliminacion IS NULL
       ) AND eliminacion IS NULL`,
      [id_curso]
    );

    await client.query(
      `UPDATE modulo SET eliminacion = NOW()
       WHERE id_curso = $1 AND eliminacion IS NULL`,
      [id_curso]
    );

    const result = await client.query(
      `UPDATE curso SET eliminacion = NOW()
       WHERE id_curso = $1 AND eliminacion IS NULL
       RETURNING id_curso, eliminacion`,
      [id_curso]
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
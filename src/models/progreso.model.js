import pool from '../database/db.js';

export const marcarContenidoComoVisto = async (id_usuario, id_contenido) => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Averiguar a qué curso y módulo pertenece este contenido
        const infoQuery = `
      SELECT c.id_modulo, m.id_curso 
      FROM contenido c
      INNER JOIN modulo m ON c.id_modulo = m.id_modulo
      WHERE c.id_contenido = $1
    `;
        const infoResult = await client.query(infoQuery, [id_contenido]);

        if (infoResult.rows.length === 0) {
            throw new Error('Contenido no encontrado');
        }

        const { id_modulo, id_curso } = infoResult.rows[0];

        // 2. Insertar en progreso_estudiante (Solo si no existe gracias al ON CONFLICT)
        const insertProgresoQuery = `
      INSERT INTO progreso_estudiante (id_usuario, id_curso, id_modulo, id_contenido, completado, completado_en)
      VALUES ($1, $2, $3, $4, true, NOW())
      ON CONFLICT (id_usuario, id_contenido) DO NOTHING
      RETURNING id_progreso
    `;
        const insertResult = await client.query(insertProgresoQuery, [id_usuario, id_curso, id_modulo, id_contenido]);

        // Si rowCount es 0, significa que el estudiante ya había visto este video antes. No sumamos nada.
        if (insertResult.rowCount === 0) {
            await client.query('ROLLBACK');
            return { message: 'El contenido ya estaba completado', actualizado: false };
        }

        // 3. Upsert progreso_curso — crea la fila si no existe (inscripciones nuevas)
        //    y calcula porcentaje desde progreso_estudiante para evitar drift entre tablas.
        const upsertCursoQuery = `
      INSERT INTO progreso_curso (
        id_usuario, id_curso,
        contenidos_completados, total_contenidos,
        porcentaje, completado, aprobado, fecha_inicio, fecha_completado
      )
      SELECT
        $1, $2,
        pe.completados,
        ct.total,
        CASE WHEN ct.total > 0
          THEN LEAST(ROUND((pe.completados::numeric / ct.total) * 100, 2), 100)
          ELSE 0
        END,
        ct.total > 0 AND pe.completados >= ct.total,
        false,
        NOW(),
        CASE WHEN ct.total > 0 AND pe.completados >= ct.total THEN NOW() ELSE NULL END
      FROM
        (SELECT COUNT(*)::int AS completados
           FROM progreso_estudiante
          WHERE id_usuario = $1 AND id_curso = $2) AS pe,
        (SELECT COUNT(*)::int AS total
           FROM contenido c
           JOIN modulo m ON c.id_modulo = m.id_modulo
          WHERE m.id_curso = $2 AND c.eliminacion IS NULL AND m.eliminacion IS NULL) AS ct
      ON CONFLICT (id_usuario, id_curso) DO UPDATE SET
        contenidos_completados = EXCLUDED.contenidos_completados,
        total_contenidos       = EXCLUDED.total_contenidos,
        porcentaje             = EXCLUDED.porcentaje,
        completado             = EXCLUDED.completado,
        fecha_completado       = CASE
                                   WHEN EXCLUDED.completado AND progreso_curso.fecha_completado IS NULL
                                     THEN NOW()
                                   WHEN NOT EXCLUDED.completado
                                     THEN NULL
                                   ELSE progreso_curso.fecha_completado
                                 END
      RETURNING porcentaje, completado
    `;

        const updateResult = await client.query(upsertCursoQuery, [id_usuario, id_curso]);

        await client.query('COMMIT');

        return {
            message: 'Progreso actualizado correctamente',
            actualizado: true,
            idCurso: id_curso,
            nuevoPorcentaje: updateResult.rows[0]?.porcentaje,
            cursoCompletado: updateResult.rows[0]?.completado
        };

    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

export const sincronizarProgresoCurso = async (id_usuario, id_curso) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const upsertQuery = `
      INSERT INTO progreso_curso (
        id_usuario, id_curso,
        contenidos_completados, total_contenidos,
        porcentaje, completado, aprobado, fecha_inicio, fecha_completado
      )
      SELECT
        $1, $2,
        pe.completados,
        ct.total,
        CASE WHEN ct.total > 0
          THEN LEAST(ROUND((pe.completados::numeric / ct.total) * 100, 2), 100)
          ELSE 0
        END,
        ct.total > 0 AND pe.completados >= ct.total,
        false,
        NOW(),
        CASE WHEN ct.total > 0 AND pe.completados >= ct.total THEN NOW() ELSE NULL END
      FROM
        (SELECT COUNT(*)::int AS completados
           FROM progreso_estudiante
          WHERE id_usuario = $1 AND id_curso = $2) AS pe,
        (SELECT COUNT(*)::int AS total
           FROM contenido c
           JOIN modulo m ON c.id_modulo = m.id_modulo
          WHERE m.id_curso = $2 AND c.eliminacion IS NULL AND m.eliminacion IS NULL) AS ct
      ON CONFLICT (id_usuario, id_curso) DO UPDATE SET
        contenidos_completados = EXCLUDED.contenidos_completados,
        total_contenidos       = EXCLUDED.total_contenidos,
        porcentaje             = EXCLUDED.porcentaje,
        completado             = EXCLUDED.completado,
        fecha_completado       = CASE
                                   WHEN EXCLUDED.completado AND progreso_curso.fecha_completado IS NULL
                                     THEN NOW()
                                   WHEN NOT EXCLUDED.completado
                                     THEN NULL
                                   ELSE progreso_curso.fecha_completado
                                 END
      RETURNING porcentaje, completado
    `;

        const result = await client.query(upsertQuery, [id_usuario, id_curso]);
        await client.query('COMMIT');

        return {
            idCurso: id_curso,
            porcentaje: result.rows[0]?.porcentaje,
            completado: result.rows[0]?.completado ?? false,
        };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};
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

        // 3. Como es un video nuevo visto, le sumamos 1 a progreso_curso y recalculamos
        const updateCursoQuery = `
      UPDATE progreso_curso
      SET 
        contenidos_completados = contenidos_completados + 1,
        porcentaje = CASE 
            WHEN total_contenidos > 0 THEN 
                LEAST(ROUND(((contenidos_completados + 1)::numeric / total_contenidos) * 100, 2), 100)
            ELSE 0 
        END,
        completado = CASE 
            WHEN (contenidos_completados + 1) >= total_contenidos THEN true 
            ELSE false 
        END,
        fecha_completado = CASE 
            WHEN (contenidos_completados + 1) >= total_contenidos THEN NOW() 
            ELSE NULL 
        END
      WHERE id_usuario = $1 AND id_curso = $2
      RETURNING porcentaje, completado
    `;

        const updateResult = await client.query(updateCursoQuery, [id_usuario, id_curso]);

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
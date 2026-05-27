import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import swaggerUi from 'swagger-ui-express';
import swaggerSpec from './config/swagger.js';
import authRoutes from './routes/authRoutes.js';
import roleRoutes from './routes/roleRoutes.js';
import userRoutes from './routes/userRoutes.js';
import institucionRoutes from './routes/institucionRoutes.js';
import { errorHandler } from './middleware/errorHandler.js';
import documentosRouter from './routes/archivos/documentosRouter.js';
import teacherRoutes from './routes/teacher.routes.js';
import superadminRoutes from './routes/superadminRoutes.js';
import certificateRoutes from './routes/certificateRoutes.js';
import progresoRoutes from './routes/progresoRoutes.js';
import reportesRoutes from './routes/reportesRoutes.js';
import validacionRoutes from './routes/validacionRoutes.js';
import cursoRoutes     from './routes/curso.routes.js';
import moduloRoutes    from './routes/modulo.routes.js';
import contenidoRoutes from './routes/contenido.routes.js';
import inscripcionRoutes from './routes/inscripcion.routes.js';
import adminDashboardRoutes from './routes/adminDashboardRoutes.js';
import { startViewRefreshScheduler, stopViewRefreshScheduler } from './utils/viewRefreshScheduler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use('/src/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/api-docs.json', (_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.json(swaggerSpec);
});
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'PlataformaIUSH · API Docs',
  customCss: '.swagger-ui .topbar { background-color: #1a1a2e; }',
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    defaultModelsExpandDepth: 2,
    docExpansion: 'list',
    filter: true,
    url: '/api-docs.json',
  },
}));

app.get('/health', (_req, res) =>
  res.json({ status: 'UP', service: 'PlataformaIUSH-Backend', version: '1.0.0' })
);

// Módulos de otros equipos
app.use('/api/documentos',               documentosRouter);
app.use('/api/auth',                     authRoutes);
app.use('/api/roles',                    roleRoutes);
app.use('/api/users',                    userRoutes);
app.use('/api/institucion',              institucionRoutes);
app.use('/api/teacher',                  teacherRoutes);
app.use('/api/cursos',                   cursoRoutes);
app.use('/api/cursos/:cursoId/modulos',  moduloRoutes);
app.use('/api/modulos/:moduloId/contenidos', contenidoRoutes);
app.use('/api/superadmin',               superadminRoutes);
app.use('/api/inscripciones',            inscripcionRoutes);
app.use('/api/admin/dashboard',          adminDashboardRoutes);

app.use('/api/reportes', reportesRoutes);

// Módulo Equipo 5 — Progreso, Validación y Certificados
app.use('/certificates', certificateRoutes);
app.use('/progreso',     progresoRoutes);
app.use('/validacion',   validacionRoutes);

app.use((_req, res) =>
  res.status(404).json({ success: false, message: 'Ruta no encontrada.' })
);

app.use(errorHandler);

startViewRefreshScheduler();

process.on('SIGINT', () => {
  console.log('[AppShutdown] Deteniendo scheduler de vistas materializadas...');
  stopViewRefreshScheduler();
  process.exit(0);
});

export default app;

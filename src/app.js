import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { HONEYPOT_FIELD, validateSubmission } from './validate.js';
import { jobRouter } from './routes/jobRoutes.js';
 
/**
 * Builds the Express app. `sites` comes from loadSites(); `transporters` maps
 * site id to a Nodemailer transport (injected so tests can use fakes).
 */
export function createApp({ sites, transporters, env = process.env, logger = console }) {
  const app = express();
 
  // Render (and most PaaS) sit behind one proxy; needed for real client IPs.
  app.set('trust proxy', Number(env.TRUST_PROXY ?? 1));
  app.use(helmet());
  app.use(express.json({ limit: '20kb' }));
  app.use(express.urlencoded({ extended: false, limit: '20kb' }));
 
  app.get('/', (req, res) => res.json({ ok: true, service: 'email-server', sites: Object.keys(sites) }));
  app.get('/health', (req, res) => res.json({ ok: true }));
 
  const router = express.Router();
 
  function resolveSite(req, res, next) {
    const site = sites[req.params.siteId?.toLowerCase()];
    if (!site) return res.status(404).json({ ok: false, error: 'Unknown site' });
    req.site = site;
    next();
  }
 
  // Each site only accepts browser requests from its own origins.
  const siteCors = cors((req, cb) => {
    const origin = req.header('Origin');
    const allowed = !origin || req.site.allowedOrigins.includes(origin);
    cb(null, { origin: allowed ? origin || false : false, methods: ['POST'], maxAge: 86_400 });
  });
 
  function rejectForeignOrigin(req, res, next) {
    const origin = req.header('Origin');
    if (origin && !req.site.allowedOrigins.includes(origin)) {
      logger.warn(`[${req.site.id}] blocked origin ${origin}`);
      return res.status(403).json({ ok: false, error: 'Origin not allowed' });
    }
    next();
  }
 
  const limiter = rateLimit({
    windowMs: Number(env.RATE_LIMIT_WINDOW_MIN || 15) * 60_000,
    limit: Number(env.RATE_LIMIT_MAX || 5),
    keyGenerator: (req) => `${req.site.id}:${ipKeyGenerator(req.ip)}`,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { ok: false, error: 'Too many requests, please try again later.' },
  });
 
  router.options('/:siteId', resolveSite, siteCors);
 
  router.post('/:siteId', resolveSite, siteCors, rejectForeignOrigin, limiter, async (req, res) => {
    const { site } = req;
    const transporter = transporters[site.id];
 
    // Bots fill every field; humans never see this one. Pretend success.
    if (req.body?.[HONEYPOT_FIELD]) {
      logger.warn(`[${site.id}] honeypot triggered from ${req.ip}`);
      return res.json({ ok: true, message: 'Thank you! Your message has been sent.' });
    }
 
    const { data, fields, errors } = validateSubmission(req.body, site);
    if (errors) return res.status(400).json({ ok: false, errors });
 
    if (!site.smtp.user || !site.smtp.pass || !site.toEmails.length || !site.fromEmail) {
      logger.error(`[${site.id}] missing ${site.envPrefix}_SMTP_USER (or SMTP_USER) / ${site.envPrefix}_TO_EMAILS`);
      return res.status(500).json({ ok: false, error: 'Contact form is not configured' });
    }
 
    const meta = { receivedAt: new Date(), ip: req.ip, origin: req.header('Origin') };
    const ctx = { data, fields, site, meta };
    const from = { name: site.fromName, address: site.fromEmail };
 
    const admin = site.template.adminEmail(ctx);
    const adminSend = transporter.sendMail({
      from,
      to: site.toEmails,
      cc: site.ccEmails.length ? site.ccEmails : undefined,
      replyTo: { name: data.name, address: data.email },
      subject: admin.subject,
      html: admin.html,
      text: admin.text,
    });
 
    let userSend = Promise.resolve(null);
    /*
    // Disabled: User acknowledgement email to customer
    if (site.sendUserAck) {
      const ack = site.template.userEmail(ctx);
      userSend = transporter.sendMail({
        from,
        to: { name: data.name, address: data.email },
        replyTo: site.replyTo,
        subject: ack.subject,
        html: ack.html,
        text: ack.text,
      });
    }
    */
 
    const [adminResult, userResult] = await Promise.allSettled([adminSend, userSend]);
 
    if (userResult.status === 'rejected') {
      // Not fatal: the team still got the enquiry.
      logger.error(`[${site.id}] acknowledgement email failed:`, userResult.reason?.message);
    }
    if (adminResult.status === 'rejected') {
      logger.error(`[${site.id}] notification email failed:`, adminResult.reason?.message);
      return res.status(502).json({ ok: false, error: 'Could not send your message. Please try again later.' });
    }
 
    logger.info(`[${site.id}] enquiry from ${data.email} delivered to ${site.toEmails.join(', ')}`);
    res.json({ ok: true, message: 'Thank you! Your message has been sent.' });
  });
 
  app.use('/api/contact', router);
  app.use('/api/jobs', jobRouter);
 
  app.use((req, res) => res.status(404).json({ ok: false, error: 'Not found' }));
 
  // Malformed JSON, oversized bodies, etc.
  app.use((err, req, res, next) => {
    const status = err.status || err.statusCode || 500;
    if (status >= 500) logger.error(err);
    res.status(status).json({ ok: false, error: status >= 500 ? 'Internal server error' : err.message });
  });
 
  return app;
}
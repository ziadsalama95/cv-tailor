// Local review server. Keeps QA traffic out of the deployment's activity logs.
process.env.LOG_API_URL = '';
process.env.LOG_API_SECRET = '';
const app = require('../server');
const fixture = process.argv.includes('--fixture');
const longFixture = process.argv.includes('--long-fixture');
const port = Number(process.env.PREVIEW_PORT) || (fixture ? 3002 : 3001);
const preview = require('express')();
if (fixture) {
  preview.use(require('express').json());
  preview.post('/api/tailor', (req, res) => {
    // Deterministic UI test response; never calls the AI provider.
    res.setHeader('Content-Type', 'text/event-stream');
    res.flushHeaders();
    res.write('event: progress\ndata: {"phase":"accepted"}\n\n');
    const data = {
      name: 'Alex Morgan', title: req.body.jobTitle,
      contact: { email: 'alex@example.com', phone: '+44 7700 900123', location: 'London, UK' },
      summary: 'Product designer with experience creating accessible interfaces and conducting usability research.',
      skills: ['Interaction design', 'Accessibility', 'User research'],
      experience: [{ role: 'Product Designer', company: 'Example Studio', dates: '2022 – Present', bullets: ['Designed accessible interfaces and conducted usability research.'] }],
      education: [{ degree: 'BA Design', institution: 'Example University', dates: '2017 – 2020' }]
    };
    if (longFixture) data.experience[0].bullets = Array.from({ length: 22 }, (_, i) => `Achievement ${i + 1}: Designed accessible interfaces, collaborated with researchers and engineers, and improved navigation through customer research.`);
    const output = '===CV_JSON===\n' + JSON.stringify(data);
    let cursor = 0, streamTimer;
    const timer = setTimeout(() => {
      streamTimer = setInterval(() => {
        const token = output.slice(cursor, cursor + (longFixture ? 35 : 12));
        cursor += token.length;
        res.write(`event: message\ndata: ${JSON.stringify({ token })}\n\n`);
        if (cursor >= output.length) {
          clearInterval(streamTimer);
          res.end('event: done\ndata: {"finishReason":"stop"}\n\n');
        }
      }, 80);
    }, longFixture ? 6000 : 2000);
    res.on('close', () => { clearTimeout(timer); clearInterval(streamTimer); });
  });
}
preview.use(app);
preview.listen(port, '127.0.0.1', () => console.log(`Local preview: http://127.0.0.1:${port} (activity logging disabled${fixture ? ', fixture responses' : ''})`));

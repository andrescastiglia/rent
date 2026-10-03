// The assistant and browser use the same inventory of real application pages.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const app = path.join(root, 'frontend/src/app/[locale]');
const policies = {
  dashboard: 'dashboard', properties: 'properties', owners: 'owners',
  tenants: 'tenants', buyers: 'self-service', interested: 'interested',
  payments: 'payments', invoices: 'invoices', leases: 'leases',
  sales: 'sales', staff: 'users', users: 'users', maintenance: 'maintenance',
  reports: 'reports', templates: 'templates', prospect: 'interested',
};
const titles = {
  dashboard: 'Panel de gestión', properties: 'Propiedades', owners: 'Propietarios',
  tenants: 'Inquilinos', buyers: 'Compradores', interested: 'Interesados',
  payments: 'Cobranza', invoices: 'Facturas', leases: 'Contratos', sales: 'Ventas',
  staff: 'Personal', users: 'Usuarios', maintenance: 'Mantenimiento',
  reports: 'Reportes', templates: 'Plantillas', prospect: 'Prospectos',
  settings: 'Configuración', portal: 'Portal personal', privacy: 'Privacidad',
  terms: 'Términos', 'data-deletion': 'Eliminación de datos',
};
function files(dir) {
  return fs.readdirSync(dir, {withFileTypes:true}).flatMap(entry =>
    entry.isDirectory() ? files(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
}
function fields(file, visited = new Set(), openers = false) {
  if (visited.has(file) || !fs.existsSync(file)) return [];
  visited.add(file);
  const source = fs.readFileSync(file, 'utf8');
  const pattern = openers ? /data-assistant-open="([\w.-]+)"/g : /(?:id|name|data-guide)="([\w.-]+)"|register\("([\w.]+)"/g;
  const controls = [...source.matchAll(pattern)]
    .map(match => match[1] || match[2]);
  for (const match of source.matchAll(/from\s+["'](@\/components\/[^"']+|\.[^"']+)["']/g)) {
    const base = match[1].startsWith('@/')
      ? path.join(root, 'frontend/src', match[1].slice(2))
      : path.resolve(path.dirname(file), match[1]);
    const component = [base + '.tsx', base + '/index.tsx'].find(fs.existsSync);
    if (component) controls.push(...fields(component, visited, openers));
  }
  return [...new Set(controls)].sort();
}
const pages = files(app).filter(file => file.endsWith('/page.tsx')).flatMap(file => {
  const route = '/' + path.relative(app, path.dirname(file)).split(path.sep).join('/');
  // Authentication, landing redirects and OAuth callbacks are not assistant destinations.
  if (route === '/' || route === '/.' || route.includes('(') || route.includes('/callback')) return [];
  const parts = route.split('/').filter(Boolean);
  const module = parts[0];
  let permission = policies[module] || 'self-service';
  if (route.startsWith('/properties/owners')) permission = 'owners';
  if (route === '/settings/communications') permission = 'communications';
  if (route === '/settings/mercadolibre') permission = 'properties';
  const roles = route === '/settings/mercadolibre' ? ['admin'] : module === 'portal' ? [parts[1]] : permission === 'self-service' && module !== 'buyers'
    ? ['admin', 'staff', 'owner', 'tenant', 'buyer'] : ['admin', 'staff'];
  return [{path:route, title: titles[module] || module, permission, roles, fields: fields(file), openers:fields(file,new Set(),true)}];
}).sort((a,b) => a.path.localeCompare(b.path));
const output = JSON.stringify(pages, null, 2) + '\n';
for (const target of ['backend/src/ai/ai-application-pages.json', 'frontend/src/lib/ai-application-pages.json']) {
  const file = path.join(root, target);
  if (process.argv.includes('--check')) {
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== output)
      throw new Error(`Regenerate assistant pages: node scripts/generate-assistant-pages.cjs (${target})`);
  } else fs.writeFileSync(file, output);
}

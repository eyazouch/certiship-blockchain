// Démonstration du scénario 6 (modification des données) : change le nom d'un produit
// directement dans la base, sans passer par l'application. La vérification d'intégrité
// doit ensuite le détecter.
// Usage : node scripts/falsifier.mjs <numéro> "<nouveau nom>"
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const [number, name = 'Produit falsifié'] = process.argv.slice(2);
if (!/^\d+$/.test(number ?? '')) {
  console.error('Usage : node scripts/falsifier.mjs <numéro> "<nouveau nom>"');
  process.exit(1);
}

const dbPath = fileURLToPath(new URL('../backend/data/app.db', import.meta.url));
const db = new DatabaseSync(dbPath);
const before = db.prepare('SELECT name FROM products WHERE number = ?').get(Number(number));
if (!before) {
  console.error(`Produit n°${number} introuvable dans la base.`);
  process.exit(1);
}
db.prepare('UPDATE products SET name = ? WHERE number = ?').run(name, Number(number));
console.log(`Produit n°${number} : « ${before.name} » → « ${name} » (modifié directement en base)`);

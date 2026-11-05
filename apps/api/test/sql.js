// D1 exec splits on newlines; migration files need statement-aware execution.
// Preserve quoted semicolons and complete SQLite trigger bodies.
export function sqlStatements(sql) {
  const statements = [];
  let current = '', quote = null;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (!quote && ch === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i++;
      current += '\n';
      continue;
    }
    current += ch;
    if (quote) {
      if (ch === quote) {
        if (sql[i + 1] === quote) current += sql[++i];
        else quote = null;
      }
    } else if (ch === "'" || ch === '"') quote = ch;
    else if (ch === ';' && (!/^\s*CREATE TRIGGER/i.test(current) || /END;\s*$/i.test(current))) {
      statements.push(current.trim()); current = '';
    }
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

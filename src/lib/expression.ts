/**
 * Expression evaluator for value expressions like:
 * - Simple column reference: @columnName
 * - Arithmetic: @a + @b, @a - @b, @a * @b, @a / @b
 * - Functions: abs(@a), log(@a), log10(@a), sqrt(@a), exp(@a)
 * - Complex: abs(@a - @b), log(@value) * 2 + 1
 */

type TokenType = 'NUMBER' | 'COLUMN' | 'OPERATOR' | 'FUNCTION' | 'LPAREN' | 'RPAREN';

interface Token {
  type: TokenType;
  value: string | number;
}

const FUNCTIONS = ['abs', 'log', 'log10', 'sqrt', 'exp', 'pow', 'min', 'max'];
const OPERATORS = ['+', '-', '*', '/'];

/**
 * Tokenize an expression string
 */
function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < expr.length) {
    const char = expr[i];

    // Skip whitespace
    if (/\s/.test(char)) {
      i++;
      continue;
    }

    // Column reference: @columnName
    if (char === '@') {
      i++;
      let name = '';
      while (i < expr.length && /[\w]/.test(expr[i])) {
        name += expr[i];
        i++;
      }
      if (name) {
        tokens.push({ type: 'COLUMN', value: name });
      }
      continue;
    }

    // Number (including negative numbers at start or after operator/paren)
    if (/\d/.test(char) || (char === '.' && i + 1 < expr.length && /\d/.test(expr[i + 1]))) {
      let num = '';
      while (i < expr.length && /[\d.]/.test(expr[i])) {
        num += expr[i];
        i++;
      }
      tokens.push({ type: 'NUMBER', value: parseFloat(num) });
      continue;
    }

    // Operators
    if (OPERATORS.includes(char)) {
      tokens.push({ type: 'OPERATOR', value: char });
      i++;
      continue;
    }

    // Parentheses
    if (char === '(') {
      tokens.push({ type: 'LPAREN', value: '(' });
      i++;
      continue;
    }
    if (char === ')') {
      tokens.push({ type: 'RPAREN', value: ')' });
      i++;
      continue;
    }

    // Function names or identifiers
    if (/[a-zA-Z_]/.test(char)) {
      let name = '';
      while (i < expr.length && /[\w]/.test(expr[i])) {
        name += expr[i];
        i++;
      }
      if (FUNCTIONS.includes(name.toLowerCase())) {
        tokens.push({ type: 'FUNCTION', value: name.toLowerCase() });
      } else {
        // Treat as column name without @
        tokens.push({ type: 'COLUMN', value: name });
      }
      continue;
    }

    // Skip unknown characters
    i++;
  }

  return tokens;
}

/**
 * Simple recursive descent parser for arithmetic expressions
 */
class ExpressionParser {
  private tokens: Token[];
  private pos: number;
  private row: Record<string, unknown>;

  constructor(tokens: Token[], row: Record<string, unknown>) {
    this.tokens = tokens;
    this.pos = 0;
    this.row = row;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private consume(): Token | undefined {
    return this.tokens[this.pos++];
  }

  private expect(type: TokenType): Token {
    const token = this.consume();
    if (!token || token.type !== type) {
      throw new Error(`Expected ${type}, got ${token?.type}`);
    }
    return token;
  }

  // Parse expression with operator precedence
  parse(): number {
    return this.parseAddSub();
  }

  // Addition and subtraction (lowest precedence)
  private parseAddSub(): number {
    let left = this.parseMulDiv();

    while (this.peek()?.type === 'OPERATOR' &&
           (this.peek()?.value === '+' || this.peek()?.value === '-')) {
      const op = this.consume()!.value as string;
      const right = this.parseMulDiv();
      if (op === '+') {
        left = left + right;
      } else {
        left = left - right;
      }
    }

    return left;
  }

  // Multiplication and division (higher precedence)
  private parseMulDiv(): number {
    let left = this.parseUnary();

    while (this.peek()?.type === 'OPERATOR' &&
           (this.peek()?.value === '*' || this.peek()?.value === '/')) {
      const op = this.consume()!.value as string;
      const right = this.parseUnary();
      if (op === '*') {
        left = left * right;
      } else {
        left = right !== 0 ? left / right : NaN;
      }
    }

    return left;
  }

  // Unary minus
  private parseUnary(): number {
    if (this.peek()?.type === 'OPERATOR' && this.peek()?.value === '-') {
      this.consume();
      return -this.parsePrimary();
    }
    return this.parsePrimary();
  }

  // Primary: numbers, columns, functions, parentheses
  private parsePrimary(): number {
    const token = this.peek();

    if (!token) {
      return NaN;
    }

    // Number literal
    if (token.type === 'NUMBER') {
      this.consume();
      return token.value as number;
    }

    // Column reference
    if (token.type === 'COLUMN') {
      this.consume();
      const colName = token.value as string;
      const val = this.row[colName];
      if (val === null || val === undefined) {
        return NaN;
      }
      const num = parseFloat(String(val));
      return num;
    }

    // Function call
    if (token.type === 'FUNCTION') {
      this.consume();
      const funcName = token.value as string;
      this.expect('LPAREN');

      // Parse arguments (handle multi-argument functions like pow, min, max)
      const args: number[] = [];
      args.push(this.parse());

      // Check for comma-separated additional arguments
      while (this.peek()?.type === 'OPERATOR' && this.peek()?.value === ',') {
        this.consume(); // consume comma (note: we're reusing OPERATOR type)
        args.push(this.parse());
      }

      this.expect('RPAREN');

      return this.applyFunction(funcName, args);
    }

    // Parenthesized expression
    if (token.type === 'LPAREN') {
      this.consume();
      const value = this.parse();
      this.expect('RPAREN');
      return value;
    }

    return NaN;
  }

  private applyFunction(name: string, args: number[]): number {
    const x = args[0];

    switch (name) {
      case 'abs':
        return Math.abs(x);
      case 'log':
        return x > 0 ? Math.log(x) : NaN;
      case 'log10':
        return x > 0 ? Math.log10(x) : NaN;
      case 'sqrt':
        return x >= 0 ? Math.sqrt(x) : NaN;
      case 'exp':
        return Math.exp(x);
      case 'pow':
        return args.length >= 2 ? Math.pow(x, args[1]) : NaN;
      case 'min':
        return Math.min(...args);
      case 'max':
        return Math.max(...args);
      default:
        return NaN;
    }
  }
}

/**
 * Evaluate a value expression against a data row
 *
 * @param expression - Expression string like "@pKi", "abs(@a - @b)", "log(@value)"
 * @param row - Object with column values
 * @returns Computed numeric value or undefined if invalid
 *
 * @example
 * evaluateExpression("@pKi", { pKi: 7.5 }) // => 7.5
 * evaluateExpression("abs(@a - @b)", { a: 10, b: 15 }) // => 5
 * evaluateExpression("log10(@ic50)", { ic50: 100 }) // => 2
 */
export function evaluateExpression(
  expression: string | undefined,
  row: Record<string, unknown>
): number | undefined {
  if (!expression || !expression.trim()) {
    return undefined;
  }

  try {
    const tokens = tokenize(expression);
    if (tokens.length === 0) {
      return undefined;
    }

    const parser = new ExpressionParser(tokens, row);
    const result = parser.parse();

    if (isNaN(result) || !isFinite(result)) {
      return undefined;
    }

    return result;
  } catch {
    return undefined;
  }
}

/**
 * Check if an expression is valid (can be parsed)
 */
export function isValidExpression(expression: string): boolean {
  if (!expression || !expression.trim()) {
    return false;
  }

  try {
    const tokens = tokenize(expression);
    // Check basic validity - must have at least one column reference or number
    const hasValue = tokens.some(t => t.type === 'COLUMN' || t.type === 'NUMBER');
    return hasValue;
  } catch {
    return false;
  }
}

/**
 * Extract column names referenced in an expression
 */
export function getExpressionColumns(expression: string): string[] {
  if (!expression) return [];

  const columns: string[] = [];
  const matches = expression.matchAll(/@(\w+)/g);

  for (const match of matches) {
    if (!columns.includes(match[1])) {
      columns.push(match[1]);
    }
  }

  return columns;
}

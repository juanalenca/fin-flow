from http import HTTPStatus
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import parse_qs, urlparse
import datetime as dt
import hashlib
import hmac
import json
import mimetypes
import os
import re
import sqlite3
import uuid


BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
DB_PATH = BASE_DIR / "finance.db"
SESSION_DAYS = 30
MAX_BODY_BYTES = 1024 * 1024

BUDGET_TYPES = {"needs", "wants", "savings", "vr"}
ENTRY_KINDS = {"expense", "income"}
MAIN_BUDGETS = ("needs", "wants", "savings")


def now_iso():
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


def connect_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    with connect_db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                salt TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS user_settings (
                user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                monthly_income_cents INTEGER NOT NULL DEFAULT 0,
                vr_initial_balance_cents INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS entries (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                description TEXT NOT NULL,
                value_cents INTEGER NOT NULL,
                entry_date TEXT NOT NULL,
                category TEXT NOT NULL,
                budget_type TEXT NOT NULL CHECK (budget_type IN ('needs', 'wants', 'savings', 'vr')),
                payment_method TEXT NOT NULL,
                note TEXT NOT NULL DEFAULT '',
                entry_kind TEXT NOT NULL CHECK (entry_kind IN ('expense', 'income')),
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_entries_user_date ON entries(user_id, entry_date);
            CREATE INDEX IF NOT EXISTS idx_entries_user_budget ON entries(user_id, budget_type);

            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            """
        )


def hash_password(password, salt=None):
    salt = salt or os.urandom(16).hex()
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt), 210_000)
    return digest.hex(), salt


def verify_password(password, expected_hash, salt):
    actual_hash, _ = hash_password(password, salt)
    return hmac.compare_digest(actual_hash, expected_hash)


def parse_cookie(header):
    cookies = {}
    if not header:
        return cookies
    for part in header.split(";"):
        if "=" in part:
            key, value = part.strip().split("=", 1)
            cookies[key] = value
    return cookies


def read_json(handler):
    length = int(handler.headers.get("Content-Length", "0"))
    if length > MAX_BODY_BYTES:
        raise ValueError("Payload muito grande.")
    raw = handler.rfile.read(length) if length else b"{}"
    try:
        return json.loads(raw.decode("utf-8") or "{}")
    except json.JSONDecodeError as exc:
        raise ValueError("JSON inválido.") from exc


def json_response(handler, status, payload, extra_headers=None):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    for key, value in (extra_headers or {}).items():
        handler.send_header(key, value)
    handler.end_headers()
    handler.wfile.write(body)


def error_response(handler, status, message):
    json_response(handler, status, {"error": message})


def validate_email(email):
    return bool(re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email or ""))


def validate_date(value):
    try:
        parsed = dt.date.fromisoformat(value)
    except (TypeError, ValueError) as exc:
        raise ValueError("Data inválida.") from exc
    return parsed.isoformat()


def clean_text(value, field, max_len, required=True):
    text = str(value or "").strip()
    if required and not text:
        raise ValueError(f"{field} é obrigatório.")
    if len(text) > max_len:
        raise ValueError(f"{field} deve ter no máximo {max_len} caracteres.")
    return text


def clean_cents(value, field):
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(f"{field} deve ser informado em centavos.")
    if value < 0:
        raise ValueError(f"{field} não pode ser negativo.")
    if value > 999_999_999_99:
        raise ValueError(f"{field} está acima do limite aceito.")
    return value


def build_budget(income_cents):
    needs = income_cents * 50 // 100
    wants = income_cents * 30 // 100
    savings = income_cents - needs - wants
    return {"needs": needs, "wants": wants, "savings": savings}


def get_user_from_session(handler):
    session_id = parse_cookie(handler.headers.get("Cookie")).get("session_id")
    if not session_id:
        return None
    with connect_db() as conn:
        row = conn.execute(
            """
            SELECT u.id, u.name, u.email
            FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.id = ? AND s.expires_at > ?
            """,
            (session_id, now_iso()),
        ).fetchone()
    return dict(row) if row else None


def require_user(handler):
    user = get_user_from_session(handler)
    if not user:
        error_response(handler, HTTPStatus.UNAUTHORIZED, "Sessão expirada. Entre novamente.")
        return None
    return user


def get_settings(conn, user_id):
    row = conn.execute(
        "SELECT monthly_income_cents, vr_initial_balance_cents FROM user_settings WHERE user_id = ?",
        (user_id,),
    ).fetchone()
    if row:
        return dict(row)
    conn.execute(
        "INSERT INTO user_settings (user_id, monthly_income_cents, vr_initial_balance_cents, updated_at) VALUES (?, 0, 0, ?)",
        (user_id, now_iso()),
    )
    return {"monthly_income_cents": 0, "vr_initial_balance_cents": 0}


def row_to_entry(row):
    return {
        "id": row["id"],
        "description": row["description"],
        "value_cents": row["value_cents"],
        "date": row["entry_date"],
        "category": row["category"],
        "budget_type": row["budget_type"],
        "payment_method": row["payment_method"],
        "note": row["note"],
        "entry_kind": row["entry_kind"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def parse_entry_payload(payload):
    budget_type = clean_text(payload.get("budget_type"), "Tipo de orçamento", 20)
    entry_kind = clean_text(payload.get("entry_kind", "expense"), "Tipo de lançamento", 20)
    if budget_type not in BUDGET_TYPES:
        raise ValueError("Tipo de orçamento inválido.")
    if entry_kind not in ENTRY_KINDS:
        raise ValueError("Tipo de lançamento inválido.")
    if budget_type != "vr" and entry_kind != "expense":
        raise ValueError("Receitas adicionais só são aceitas na carteira VR.")
    return {
        "description": clean_text(payload.get("description"), "Descrição", 120),
        "value_cents": clean_cents(payload.get("value_cents"), "Valor"),
        "entry_date": validate_date(payload.get("date")),
        "category": clean_text(payload.get("category"), "Categoria", 80),
        "budget_type": budget_type,
        "payment_method": clean_text(payload.get("payment_method"), "Forma de pagamento", 80),
        "note": clean_text(payload.get("note", ""), "Observação", 500, required=False),
        "entry_kind": entry_kind,
    }


def build_entry_filters(query, user_id):
    clauses = ["user_id = ?"]
    params = [user_id]
    start = query.get("start", [""])[0]
    end = query.get("end", [""])[0]
    budget_type = query.get("budget_type", [""])[0]
    search = query.get("search", [""])[0].strip()
    if start:
        clauses.append("entry_date >= ?")
        params.append(validate_date(start))
    if end:
        clauses.append("entry_date <= ?")
        params.append(validate_date(end))
    if budget_type:
        if budget_type not in BUDGET_TYPES:
            raise ValueError("Tipo de orçamento inválido.")
        clauses.append("budget_type = ?")
        params.append(budget_type)
    if search:
        clauses.append("LOWER(description) LIKE ?")
        params.append(f"%{search.lower()}%")
    return " AND ".join(clauses), params


def calculate_summary(conn, user_id, query):
    settings = get_settings(conn, user_id)
    where_sql, params = build_entry_filters(query, user_id)
    rows = conn.execute(
        f"""
        SELECT budget_type, entry_kind, SUM(value_cents) AS total
        FROM entries
        WHERE {where_sql}
        GROUP BY budget_type, entry_kind
        """,
        params,
    ).fetchall()
    period_totals = {key: {"expense": 0, "income": 0} for key in BUDGET_TYPES}
    for row in rows:
        period_totals[row["budget_type"]][row["entry_kind"]] = row["total"] or 0

    all_vr = conn.execute(
        """
        SELECT entry_kind, SUM(value_cents) AS total
        FROM entries
        WHERE user_id = ? AND budget_type = 'vr'
        GROUP BY entry_kind
        """,
        (user_id,),
    ).fetchall()
    vr_totals = {"expense": 0, "income": 0}
    for row in all_vr:
        vr_totals[row["entry_kind"]] = row["total"] or 0

    planned = build_budget(settings["monthly_income_cents"])
    buckets = {}
    for key in MAIN_BUDGETS:
        spent = period_totals[key]["expense"]
        budget = planned[key]
        remaining = budget - spent
        usage = round((spent / budget) * 100, 2) if budget else 0
        if budget and usage >= 100:
            status = "over"
        elif budget and usage >= 85:
            status = "near"
        else:
            status = "ok"
        buckets[key] = {
            "planned_cents": budget,
            "spent_cents": spent,
            "remaining_cents": remaining,
            "usage_percent": usage,
            "status": status,
        }

    total_planned = sum(planned.values())
    total_spent = sum(period_totals[key]["expense"] for key in MAIN_BUDGETS)
    vr_balance = settings["vr_initial_balance_cents"] + vr_totals["income"] - vr_totals["expense"]
    return {
        "settings": settings,
        "budgets": buckets,
        "totals": {
            "planned_cents": total_planned,
            "spent_cents": total_spent,
            "remaining_cents": total_planned - total_spent,
            "available_cents": max(total_planned - total_spent, 0),
        },
        "vr": {
            "initial_cents": settings["vr_initial_balance_cents"],
            "received_cents": vr_totals["income"],
            "spent_cents": vr_totals["expense"],
            "balance_cents": vr_balance,
            "period_received_cents": period_totals["vr"]["income"],
            "period_spent_cents": period_totals["vr"]["expense"],
        },
    }


class FinanceHandler(BaseHTTPRequestHandler):
    server_version = "FinanceDashboard/1.0"

    def log_message(self, fmt, *args):
        print(f"[{self.log_date_time_string()}] {fmt % args}")

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self.handle_api_get(parsed)
            return
        self.serve_static(parsed.path)

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self.handle_api_post(parsed)
            return
        error_response(self, HTTPStatus.NOT_FOUND, "Rota não encontrada.")

    def do_PUT(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self.handle_api_put(parsed)
            return
        error_response(self, HTTPStatus.NOT_FOUND, "Rota não encontrada.")

    def do_DELETE(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self.handle_api_delete(parsed)
            return
        error_response(self, HTTPStatus.NOT_FOUND, "Rota não encontrada.")

    def serve_static(self, path):
        if path == "/":
            path = "/index.html"
        requested = (STATIC_DIR / path.lstrip("/")).resolve()
        if STATIC_DIR not in requested.parents and requested != STATIC_DIR:
            self.send_error(HTTPStatus.FORBIDDEN)
            return
        if not requested.exists() or not requested.is_file():
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        content_type = mimetypes.guess_type(requested.name)[0] or "application/octet-stream"
        body = requested.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def handle_api_get(self, parsed):
        try:
            if parsed.path == "/api/me":
                user = get_user_from_session(self)
                json_response(self, HTTPStatus.OK, {"user": user})
                return
            user = require_user(self)
            if not user:
                return
            query = parse_qs(parsed.query)
            if parsed.path == "/api/settings":
                with connect_db() as conn:
                    json_response(self, HTTPStatus.OK, {"settings": get_settings(conn, user["id"])})
                return
            if parsed.path == "/api/entries":
                where_sql, params = build_entry_filters(query, user["id"])
                with connect_db() as conn:
                    rows = conn.execute(
                        f"SELECT * FROM entries WHERE {where_sql} ORDER BY entry_date DESC, created_at DESC",
                        params,
                    ).fetchall()
                json_response(self, HTTPStatus.OK, {"entries": [row_to_entry(row) for row in rows]})
                return
            if parsed.path == "/api/summary":
                with connect_db() as conn:
                    json_response(self, HTTPStatus.OK, {"summary": calculate_summary(conn, user["id"], query)})
                return
            error_response(self, HTTPStatus.NOT_FOUND, "Rota não encontrada.")
        except ValueError as exc:
            error_response(self, HTTPStatus.BAD_REQUEST, str(exc))
        except sqlite3.Error:
            error_response(self, HTTPStatus.INTERNAL_SERVER_ERROR, "Erro ao acessar o banco de dados.")

    def handle_api_post(self, parsed):
        try:
            payload = read_json(self)
            if parsed.path == "/api/auth/register":
                self.register(payload)
                return
            if parsed.path == "/api/auth/login":
                self.login(payload)
                return
            if parsed.path == "/api/auth/logout":
                self.logout()
                return
            user = require_user(self)
            if not user:
                return
            if parsed.path == "/api/entries":
                data = parse_entry_payload(payload)
                entry_id = str(uuid.uuid4())
                timestamp = now_iso()
                with connect_db() as conn:
                    conn.execute(
                        """
                        INSERT INTO entries (
                            id, user_id, description, value_cents, entry_date, category,
                            budget_type, payment_method, note, entry_kind, created_at, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            entry_id,
                            user["id"],
                            data["description"],
                            data["value_cents"],
                            data["entry_date"],
                            data["category"],
                            data["budget_type"],
                            data["payment_method"],
                            data["note"],
                            data["entry_kind"],
                            timestamp,
                            timestamp,
                        ),
                    )
                    row = conn.execute("SELECT * FROM entries WHERE id = ?", (entry_id,)).fetchone()
                json_response(self, HTTPStatus.CREATED, {"entry": row_to_entry(row)})
                return
            error_response(self, HTTPStatus.NOT_FOUND, "Rota não encontrada.")
        except ValueError as exc:
            error_response(self, HTTPStatus.BAD_REQUEST, str(exc))
        except sqlite3.IntegrityError:
            error_response(self, HTTPStatus.CONFLICT, "Já existe uma conta com este e-mail.")
        except sqlite3.Error:
            error_response(self, HTTPStatus.INTERNAL_SERVER_ERROR, "Erro ao acessar o banco de dados.")

    def handle_api_put(self, parsed):
        try:
            user = require_user(self)
            if not user:
                return
            payload = read_json(self)
            if parsed.path == "/api/settings":
                income = clean_cents(payload.get("monthly_income_cents"), "Renda mensal")
                vr_initial = clean_cents(payload.get("vr_initial_balance_cents"), "Saldo inicial VR")
                with connect_db() as conn:
                    get_settings(conn, user["id"])
                    conn.execute(
                        """
                        UPDATE user_settings
                        SET monthly_income_cents = ?, vr_initial_balance_cents = ?, updated_at = ?
                        WHERE user_id = ?
                        """,
                        (income, vr_initial, now_iso(), user["id"]),
                    )
                json_response(self, HTTPStatus.OK, {"settings": {"monthly_income_cents": income, "vr_initial_balance_cents": vr_initial}})
                return
            match = re.match(r"^/api/entries/([0-9a-fA-F-]+)$", parsed.path)
            if match:
                data = parse_entry_payload(payload)
                entry_id = match.group(1)
                with connect_db() as conn:
                    result = conn.execute(
                        """
                        UPDATE entries
                        SET description = ?, value_cents = ?, entry_date = ?, category = ?,
                            budget_type = ?, payment_method = ?, note = ?, entry_kind = ?, updated_at = ?
                        WHERE id = ? AND user_id = ?
                        """,
                        (
                            data["description"],
                            data["value_cents"],
                            data["entry_date"],
                            data["category"],
                            data["budget_type"],
                            data["payment_method"],
                            data["note"],
                            data["entry_kind"],
                            now_iso(),
                            entry_id,
                            user["id"],
                        ),
                    )
                    if result.rowcount == 0:
                        error_response(self, HTTPStatus.NOT_FOUND, "Lançamento não encontrado.")
                        return
                    row = conn.execute("SELECT * FROM entries WHERE id = ? AND user_id = ?", (entry_id, user["id"])).fetchone()
                json_response(self, HTTPStatus.OK, {"entry": row_to_entry(row)})
                return
            error_response(self, HTTPStatus.NOT_FOUND, "Rota não encontrada.")
        except ValueError as exc:
            error_response(self, HTTPStatus.BAD_REQUEST, str(exc))
        except sqlite3.Error:
            error_response(self, HTTPStatus.INTERNAL_SERVER_ERROR, "Erro ao acessar o banco de dados.")

    def handle_api_delete(self, parsed):
        user = require_user(self)
        if not user:
            return
        match = re.match(r"^/api/entries/([0-9a-fA-F-]+)$", parsed.path)
        if not match:
            error_response(self, HTTPStatus.NOT_FOUND, "Rota não encontrada.")
            return
        with connect_db() as conn:
            result = conn.execute("DELETE FROM entries WHERE id = ? AND user_id = ?", (match.group(1), user["id"]))
        if result.rowcount == 0:
            error_response(self, HTTPStatus.NOT_FOUND, "Lançamento não encontrado.")
            return
        json_response(self, HTTPStatus.OK, {"ok": True})

    def register(self, payload):
        name = clean_text(payload.get("name"), "Nome", 80)
        email = clean_text(payload.get("email"), "E-mail", 120).lower()
        password = str(payload.get("password") or "")
        if not validate_email(email):
            raise ValueError("E-mail inválido.")
        if len(password) < 8:
            raise ValueError("A senha deve ter pelo menos 8 caracteres.")
        password_hash, salt = hash_password(password)
        user_id = str(uuid.uuid4())
        timestamp = now_iso()
        with connect_db() as conn:
            conn.execute(
                "INSERT INTO users (id, name, email, password_hash, salt, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (user_id, name, email, password_hash, salt, timestamp),
            )
            conn.execute(
                "INSERT INTO user_settings (user_id, monthly_income_cents, vr_initial_balance_cents, updated_at) VALUES (?, 0, 0, ?)",
                (user_id, timestamp),
            )
        self.create_session(user_id, {"id": user_id, "name": name, "email": email})

    def login(self, payload):
        email = clean_text(payload.get("email"), "E-mail", 120).lower()
        password = str(payload.get("password") or "")
        with connect_db() as conn:
            row = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        if not row or not verify_password(password, row["password_hash"], row["salt"]):
            error_response(self, HTTPStatus.UNAUTHORIZED, "E-mail ou senha inválidos.")
            return
        self.create_session(row["id"], {"id": row["id"], "name": row["name"], "email": row["email"]})

    def logout(self):
        session_id = parse_cookie(self.headers.get("Cookie")).get("session_id")
        if session_id:
            with connect_db() as conn:
                conn.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
        json_response(
            self,
            HTTPStatus.OK,
            {"ok": True},
            {"Set-Cookie": "session_id=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"},
        )

    def create_session(self, user_id, user_payload):
        session_id = str(uuid.uuid4())
        expires = dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=SESSION_DAYS)
        with connect_db() as conn:
            conn.execute(
                "INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
                (session_id, user_id, expires.replace(microsecond=0).isoformat(), now_iso()),
            )
        cookie = f"session_id={session_id}; Path=/; HttpOnly; SameSite=Lax; Max-Age={SESSION_DAYS * 24 * 60 * 60}"
        json_response(self, HTTPStatus.OK, {"user": user_payload}, {"Set-Cookie": cookie})


if __name__ == "__main__":
    init_db()
    port = int(os.environ.get("PORT", "8000"))
    server = ThreadingHTTPServer(("127.0.0.1", port), FinanceHandler)
    print(f"Dashboard Financeiro rodando em http://127.0.0.1:{port}")
    server.serve_forever()

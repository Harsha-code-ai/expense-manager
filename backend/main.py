"""
Expense Management System - FastAPI backend (single file).
SQLite + SQLAlchemy, JWT auth, auto table creation, demo data seeding.
Run:  uvicorn main:app --reload --port 8000
"""
import hashlib
import hmac
import os
import secrets
from collections import defaultdict
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from typing import List, Literal, Optional

import jwt
from fastapi import Depends, FastAPI, HTTPException, Query, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import Date, Float, ForeignKey, Integer, String, create_engine, func, select
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    Session,
    mapped_column,
    relationship,
    sessionmaker,
)

# --------------------------------------------------------------------------
# Config
# --------------------------------------------------------------------------
DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./expenses.db")
SECRET_KEY = os.environ.get(
    "SECRET_KEY", "expense-manager-dev-secret-key-change-me-in-production-0123456789"
)
JWT_ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 24 * 7

TxType = Literal["Income", "Expense"]
Category = Literal["Food", "Travel", "Bills", "Shopping", "Salary", "Other"]

# --------------------------------------------------------------------------
# Database
# --------------------------------------------------------------------------
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    transactions: Mapped[List["Transaction"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    type: Mapped[str] = mapped_column(String(20), nullable=False)
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    note: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    user: Mapped["User"] = relationship(back_populates="transactions")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# --------------------------------------------------------------------------
# Security helpers
# --------------------------------------------------------------------------
def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), 200_000)
    return f"{salt}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt, digest_hex = stored.split("$")
    except ValueError:
        return False
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), 200_000)
    return hmac.compare_digest(digest.hex(), digest_hex)


def create_token(user_id: int) -> str:
    payload = {
        "sub": str(user_id),
        "exp": datetime.now(timezone.utc) + timedelta(hours=TOKEN_EXPIRE_HOURS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=JWT_ALGORITHM)


bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token. Please log in again.",
    )
    if creds is None:
        raise unauthorized
    try:
        payload = jwt.decode(creds.credentials, SECRET_KEY, algorithms=[JWT_ALGORITHM])
        user_id = int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise unauthorized
    user = db.get(User, user_id)
    if user is None:
        raise unauthorized
    return user


# --------------------------------------------------------------------------
# Schemas
# --------------------------------------------------------------------------
class RegisterIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: str = Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$", max_length=255)
    password: str = Field(min_length=6, max_length=128)


class LoginIn(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    email: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class TransactionIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    amount: float = Field(gt=0, le=1_000_000_000)
    type: TxType
    category: Category
    date: date
    note: Optional[str] = Field(default=None, max_length=500)


class TransactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str
    amount: float
    type: str
    category: str
    date: date
    note: Optional[str] = None


class CategoryTotal(BaseModel):
    category: str
    total: float


class MonthlyTotal(BaseModel):
    month: str  # YYYY-MM
    income: float
    expense: float


class SummaryOut(BaseModel):
    total_income: float
    total_expense: float
    balance: float
    expense_by_category: List[CategoryTotal]
    monthly: List[MonthlyTotal]


# --------------------------------------------------------------------------
# Seed data
# --------------------------------------------------------------------------
def seed_demo_data(db: Session) -> None:
    if db.scalar(select(func.count(User.id))) != 0:
        return

    demo = User(
        name="Demo User",
        email="demo@example.com",
        password_hash=hash_password("password123"),
    )
    db.add(demo)
    db.flush()

    today = date.today()
    this_month = today.replace(day=1)
    prev_month = (this_month - timedelta(days=1)).replace(day=1)

    def d(month_start: date, day: int) -> date:
        return month_start.replace(day=day)

    samples = [
        ("Monthly Salary", 85000, "Income", "Salary", d(prev_month, 1), "Salary credited - TCS"),
        ("House Rent", 22000, "Expense", "Bills", d(prev_month, 3), "Rent via UPI"),
        ("Swiggy Dinner", 649, "Expense", "Food", d(prev_month, 12), "Biryani + dessert"),
        ("Fuel - Petrol", 2500, "Expense", "Travel", d(prev_month, 20), "HP Petrol Pump"),
        ("Monthly Salary", 85000, "Income", "Salary", d(this_month, 1), "Salary credited - TCS"),
        ("House Rent", 22000, "Expense", "Bills", d(this_month, 2), "Rent via UPI"),
        ("Airtel Fibre Internet", 999, "Expense", "Bills", d(this_month, 4), "Broadband monthly plan"),
        ("Swiggy Lunch Order", 380, "Expense", "Food", d(this_month, 6), None),
        ("UPI Transfer to Rahul", 2000, "Expense", "Other", d(this_month, 8), "Split trip expenses"),
        ("Delhi Metro Card Recharge", 500, "Expense", "Travel", d(this_month, 9), None),
        ("Amazon - Headphones", 3299, "Expense", "Shopping", d(this_month, 10), "boAt Rockerz"),
        ("Freelance Project Payment", 12000, "Income", "Other", d(this_month, 11), "Website design work"),
    ]
    for title, amount, ttype, cat, tdate, note in samples:
        db.add(
            Transaction(
                user_id=demo.id,
                title=title,
                amount=float(amount),
                type=ttype,
                category=cat,
                date=tdate,
                note=note,
            )
        )
    db.commit()


# --------------------------------------------------------------------------
# App
# --------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        seed_demo_data(db)
    yield


app = FastAPI(title="Expense Management System", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,  # we use Bearer tokens, not cookies
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"status": "ok", "docs": "/docs"}


# ---- Auth ----------------------------------------------------------------
@app.post("/api/auth/register", response_model=TokenOut, status_code=201)
def register(payload: RegisterIn, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    user = User(name=payload.name.strip(), email=email, password_hash=hash_password(payload.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return TokenOut(access_token=create_token(user.id), user=UserOut.model_validate(user))


@app.post("/api/auth/login", response_model=TokenOut)
def login(payload: LoginIn, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    user = db.scalar(select(User).where(User.email == email))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect email or password.")
    return TokenOut(access_token=create_token(user.id), user=UserOut.model_validate(user))


@app.get("/api/auth/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


# ---- Transactions --------------------------------------------------------
@app.get("/api/transactions", response_model=List[TransactionOut])
def list_transactions(
    type: Optional[str] = Query(default=None, description="Income | Expense"),
    category: Optional[str] = None,
    month: Optional[str] = Query(default=None, description="YYYY-MM"),
    on_date: Optional[date] = Query(default=None, alias="date"),
    search: Optional[str] = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    stmt = select(Transaction).where(Transaction.user_id == user.id)

    if type and type != "All":
        if type not in ("Income", "Expense"):
            raise HTTPException(status_code=400, detail="type must be Income or Expense.")
        stmt = stmt.where(Transaction.type == type)

    if category and category != "All":
        stmt = stmt.where(Transaction.category == category)

    if month:
        try:
            start = datetime.strptime(month, "%Y-%m").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="month must be in YYYY-MM format.")
        end = (start.replace(day=28) + timedelta(days=4)).replace(day=1)
        stmt = stmt.where(Transaction.date >= start, Transaction.date < end)

    if on_date:
        stmt = stmt.where(Transaction.date == on_date)

    if search and search.strip():
        stmt = stmt.where(func.lower(Transaction.title).like(f"%{search.strip().lower()}%"))

    stmt = stmt.order_by(Transaction.date.desc(), Transaction.id.desc())
    return db.scalars(stmt).all()


@app.post("/api/transactions", response_model=TransactionOut, status_code=201)
def create_transaction(
    payload: TransactionIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tx = Transaction(
        user_id=user.id,
        title=payload.title.strip(),
        amount=round(payload.amount, 2),
        type=payload.type,
        category=payload.category,
        date=payload.date,
        note=(payload.note or "").strip() or None,
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return tx


def _get_own_transaction(db: Session, user: User, tx_id: int) -> Transaction:
    tx = db.scalar(
        select(Transaction).where(Transaction.id == tx_id, Transaction.user_id == user.id)
    )
    if tx is None:
        raise HTTPException(status_code=404, detail="Transaction not found.")
    return tx


@app.put("/api/transactions/{tx_id}", response_model=TransactionOut)
def update_transaction(
    tx_id: int,
    payload: TransactionIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tx = _get_own_transaction(db, user, tx_id)
    tx.title = payload.title.strip()
    tx.amount = round(payload.amount, 2)
    tx.type = payload.type
    tx.category = payload.category
    tx.date = payload.date
    tx.note = (payload.note or "").strip() or None
    db.commit()
    db.refresh(tx)
    return tx


@app.delete("/api/transactions/{tx_id}", status_code=204)
def delete_transaction(
    tx_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tx = _get_own_transaction(db, user, tx_id)
    db.delete(tx)
    db.commit()
    return Response(status_code=204)


# ---- Summary / Analytics ---------------------------------------------------
@app.get("/api/summary", response_model=SummaryOut)
def summary(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    txs = db.scalars(select(Transaction).where(Transaction.user_id == user.id)).all()

    total_income = 0.0
    total_expense = 0.0
    by_category = defaultdict(float)
    monthly = defaultdict(lambda: {"income": 0.0, "expense": 0.0})

    for t in txs:
        key = t.date.strftime("%Y-%m")
        if t.type == "Income":
            total_income += t.amount
            monthly[key]["income"] += t.amount
        else:
            total_expense += t.amount
            monthly[key]["expense"] += t.amount
            by_category[t.category] += t.amount

    months_sorted = sorted(monthly.keys())[-12:]
    return SummaryOut(
        total_income=round(total_income, 2),
        total_expense=round(total_expense, 2),
        balance=round(total_income - total_expense, 2),
        expense_by_category=[
            CategoryTotal(category=c, total=round(v, 2))
            for c, v in sorted(by_category.items(), key=lambda kv: kv[1], reverse=True)
        ],
        monthly=[
            MonthlyTotal(
                month=m,
                income=round(monthly[m]["income"], 2),
                expense=round(monthly[m]["expense"], 2),
            )
            for m in months_sorted
        ],
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
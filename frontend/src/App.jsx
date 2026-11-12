import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
} from "chart.js";
import { Bar, Doughnut } from "react-chartjs-2";

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

/* ------------------------------------------------------------------ */
/* Config & helpers                                                    */
/* ------------------------------------------------------------------ */
const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8001/api";
const CATEGORIES = ["Food", "Travel", "Bills", "Shopping", "Salary", "Other"];
const CATEGORY_COLORS = {
  Food: "#f97316",
  Travel: "#0ea5e9",
  Bills: "#8b5cf6",
  Shopping: "#ec4899",
  Salary: "#10b981",
  Other: "#64748b",
};

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});
const formatINR = (n) => inr.format(Number(n) || 0);

const pad = (n) => String(n).padStart(2, "0");
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const formatDate = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const formatMonth = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
};

async function request(path, { method = "GET", body, token } = {}) {
  const headers = {};
  if (body) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    const err = new Error("Cannot reach the server. Is the backend running on port 8000?");
    err.status = 0;
    throw err;
  }

  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    let msg = "Something went wrong.";
    if (typeof data.detail === "string") msg = data.detail;
    else if (Array.isArray(data.detail)) msg = data.detail.map((d) => d.msg).join(", ");
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return data;
}

/* ------------------------------------------------------------------ */
/* Auth screen                                                         */
/* ------------------------------------------------------------------ */
function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "demo@example.com", password: "password123" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data =
        mode === "login"
          ? await request("/auth/login", {
              method: "POST",
              body: { email: form.email, password: form.password },
            })
          : await request("/auth/register", {
              method: "POST",
              body: { name: form.name, email: form.email, password: form.password },
            });
      onAuth({ token: data.access_token, user: data.user });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const switchMode = () => {
    setError("");
    if (mode === "login") {
      setMode("register");
      setForm({ name: "", email: "", password: "" });
    } else {
      setMode("login");
      setForm({ name: "", email: "demo@example.com", password: "password123" });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-indigo-600 via-indigo-500 to-sky-500">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">₹</div>
          <h1 className="text-2xl font-bold text-slate-900">Expense Manager</h1>
          <p className="text-sm text-slate-500 mt-1">
            {mode === "login" ? "Sign in to track your money" : "Create your free account"}
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          {mode === "register" && (
            <div>
              <label className="block text-sm font-medium mb-1">Full name</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={update("name")}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Aarav Sharma"
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={update("email")}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Password</label>
            <input
              type="password"
              required
              minLength={6}
              value={form.password}
              onChange={update("password")}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="At least 6 characters"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold rounded-lg py-2.5 transition"
          >
            {loading ? "Please wait..." : mode === "login" ? "Login" : "Create account"}
          </button>
        </form>

        <p className="text-center text-sm text-slate-600 mt-5">
          {mode === "login" ? "New here?" : "Already have an account?"}{" "}
          <button onClick={switchMode} className="text-indigo-600 font-semibold hover:underline">
            {mode === "login" ? "Register" : "Login"}
          </button>
        </p>

        {mode === "login" && (
          <p className="text-center text-xs text-slate-400 mt-3">
            Demo: demo@example.com / password123 (pre-filled)
          </p>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Summary cards                                                       */
/* ------------------------------------------------------------------ */
function SummaryCards({ summary }) {
  const cards = [
    {
      label: "Total Balance",
      value: summary.balance,
      cls: "from-indigo-600 to-indigo-500",
      icon: "💰",
    },
    {
      label: "Total Income",
      value: summary.total_income,
      cls: "from-emerald-600 to-emerald-500",
      icon: "📈",
    },
    {
      label: "Total Expense",
      value: summary.total_expense,
      cls: "from-rose-600 to-rose-500",
      icon: "📉",
    },
  ];
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {cards.map((c) => (
        <div
          key={c.label}
          className={`bg-gradient-to-r ${c.cls} text-white rounded-2xl p-5 shadow-lg`}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium opacity-90">{c.label}</span>
            <span className="text-2xl">{c.icon}</span>
          </div>
          <div className="text-3xl font-bold mt-2 break-words">{formatINR(c.value)}</div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Charts                                                              */
/* ------------------------------------------------------------------ */
function Charts({ summary }) {
  const cat = summary.expense_by_category;
  const monthly = summary.monthly;

  const doughnutData = {
    labels: cat.map((c) => c.category),
    datasets: [
      {
        data: cat.map((c) => c.total),
        backgroundColor: cat.map((c) => CATEGORY_COLORS[c.category] || "#94a3b8"),
        borderWidth: 2,
        borderColor: "#ffffff",
      },
    ],
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: "60%",
    plugins: {
      legend: { position: "bottom" },
      tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${formatINR(ctx.parsed)}` } },
    },
  };

  const barData = {
    labels: monthly.map((m) => formatMonth(m.month)),
    datasets: [
      { label: "Income", data: monthly.map((m) => m.income), backgroundColor: "#10b981", borderRadius: 6 },
      { label: "Expense", data: monthly.map((m) => m.expense), backgroundColor: "#f43f5e", borderRadius: 6 },
    ],
  };

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: "bottom" },
      tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${formatINR(ctx.parsed.y)}` } },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: { callback: (v) => "₹" + Number(v).toLocaleString("en-IN") },
      },
    },
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="bg-white rounded-2xl shadow p-5">
        <h3 className="font-semibold text-slate-800 mb-3">Expense Breakdown by Category</h3>
        <div className="h-72">
          {cat.length === 0 ? (
            <div className="h-full flex items-center justify-center text-slate-400 text-sm">
              No expenses yet
            </div>
          ) : (
            <Doughnut data={doughnutData} options={doughnutOptions} />
          )}
        </div>
      </div>
      <div className="bg-white rounded-2xl shadow p-5">
        <h3 className="font-semibold text-slate-800 mb-3">Monthly Income vs Expense</h3>
        <div className="h-72">
          {monthly.length === 0 ? (
            <div className="h-full flex items-center justify-center text-slate-400 text-sm">
              No data yet
            </div>
          ) : (
            <Bar data={barData} options={barOptions} />
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Filters                                                             */
/* ------------------------------------------------------------------ */
function Filters({ filters, setFilters }) {
  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));
  const reset = () =>
    setFilters({ type: "All", category: "All", month: "", date: "", search: "" });

  const inputCls =
    "w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500";

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
      <div className="lg:col-span-2">
        <label className="block text-xs font-medium text-slate-500 mb-1">Search title</label>
        <input
          type="text"
          placeholder="e.g. Swiggy"
          value={filters.search}
          onChange={set("search")}
          className={inputCls}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">Type</label>
        <select value={filters.type} onChange={set("type")} className={inputCls}>
          <option>All</option>
          <option>Income</option>
          <option>Expense</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">Category</label>
        <select value={filters.category} onChange={set("category")} className={inputCls}>
          <option>All</option>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">Month</label>
        <input type="month" value={filters.month} onChange={set("month")} className={inputCls} />
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="block text-xs font-medium text-slate-500 mb-1">Date</label>
          <input type="date" value={filters.date} onChange={set("date")} className={inputCls} />
        </div>
        <button
          onClick={reset}
          title="Clear all filters"
          className="px-3 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50"
        >
          Reset
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Transaction form modal (add / edit)                                 */
/* ------------------------------------------------------------------ */
function TransactionModal({ initial, onClose, onSave }) {
  const [form, setForm] = useState(
    initial
      ? {
          title: initial.title,
          amount: String(initial.amount),
          type: initial.type,
          category: initial.category,
          date: initial.date,
          note: initial.note || "",
        }
      : { title: "", amount: "", type: "Expense", category: "Food", date: todayStr(), note: "" }
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    const amount = parseFloat(form.amount);
    if (!form.title.trim()) return setError("Title is required.");
    if (!(amount > 0)) return setError("Amount must be greater than ₹0.");
    if (!form.date) return setError("Please choose a date.");
    setSaving(true);
    try {
      await onSave({
        title: form.title.trim(),
        amount,
        type: form.type,
        category: form.category,
        date: form.date,
        note: form.note.trim() || null,
      });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  const inputCls =
    "w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">{initial ? "Edit Transaction" : "Add Transaction"}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-2xl leading-none">
            ×
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Title</label>
            <input
              type="text"
              value={form.title}
              onChange={set("title")}
              className={inputCls}
              placeholder="e.g. Swiggy Dinner"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Amount (₹)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.amount}
                onChange={set("amount")}
                className={inputCls}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Date</label>
              <input type="date" value={form.date} onChange={set("date")} className={inputCls} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Type</label>
              <select value={form.type} onChange={set("type")} className={inputCls}>
                <option>Income</option>
                <option>Expense</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Category</label>
              <select value={form.category} onChange={set("category")} className={inputCls}>
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Note (optional)</label>
            <textarea
              rows={2}
              value={form.note}
              onChange={set("note")}
              className={inputCls}
              placeholder="Any extra details..."
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold rounded-lg"
            >
              {saving ? "Saving..." : initial ? "Update" : "Add Transaction"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Transaction table                                                   */
/* ------------------------------------------------------------------ */
function TransactionTable({ transactions, loading, onEdit, onDelete }) {
  if (loading && transactions.length === 0) {
    return <div className="py-10 text-center text-slate-400 text-sm">Loading transactions...</div>;
  }
  if (transactions.length === 0) {
    return (
      <div className="py-10 text-center text-slate-400 text-sm">
        No transactions found. Try changing your filters or add a new one.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase text-slate-500 border-b">
            <th className="py-2 pr-3">Date</th>
            <th className="py-2 pr-3">Title</th>
            <th className="py-2 pr-3">Category</th>
            <th className="py-2 pr-3">Type</th>
            <th className="py-2 pr-3 text-right">Amount</th>
            <th className="py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((t) => (
            <tr key={t.id} className="border-b last:border-0 hover:bg-slate-50">
              <td className="py-3 pr-3 whitespace-nowrap text-slate-600">{formatDate(t.date)}</td>
              <td className="py-3 pr-3">
                <div className="font-medium text-slate-800">{t.title}</div>
                {t.note && <div className="text-xs text-slate-400 mt-0.5">{t.note}</div>}
              </td>
              <td className="py-3 pr-3">
                <span
                  className="inline-block px-2 py-0.5 rounded-full text-xs font-medium text-white"
                  style={{ backgroundColor: CATEGORY_COLORS[t.category] || "#64748b" }}
                >
                  {t.category}
                </span>
              </td>
              <td className="py-3 pr-3">
                <span
                  className={`text-xs font-semibold ${
                    t.type === "Income" ? "text-emerald-600" : "text-rose-600"
                  }`}
                >
                  {t.type}
                </span>
              </td>
              <td
                className={`py-3 pr-3 text-right font-semibold whitespace-nowrap ${
                  t.type === "Income" ? "text-emerald-600" : "text-rose-600"
                }`}
              >
                {t.type === "Income" ? "+" : "-"}
                {formatINR(t.amount)}
              </td>
              <td className="py-3 text-right whitespace-nowrap">
                <button
                  onClick={() => onEdit(t)}
                  className="text-indigo-600 hover:underline mr-3 text-xs font-medium"
                >
                  Edit
                </button>
                <button
                  onClick={() => onDelete(t)}
                  className="text-rose-600 hover:underline text-xs font-medium"
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */
const EMPTY_SUMMARY = {
  total_income: 0,
  total_expense: 0,
  balance: 0,
  expense_by_category: [],
  monthly: [],
};

function Dashboard({ auth, onLogout }) {
  const { token, user } = auth;
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [transactions, setTransactions] = useState([]);
  const [filters, setFilters] = useState({
    type: "All",
    category: "All",
    month: "",
    date: "",
    search: "",
  });
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState({ open: false, tx: null });

  const handleError = useCallback(
    (err) => {
      if (err.status === 401) onLogout();
      else setError(err.message);
    },
    [onLogout]
  );

  // Debounce title search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(filters.search), 300);
    return () => clearTimeout(t);
  }, [filters.search]);

  const loadSummary = useCallback(async () => {
    try {
      const data = await request("/summary", { token });
      setSummary(data);
    } catch (err) {
      handleError(err);
    }
  }, [token, handleError]);

  const loadTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.type !== "All") params.set("type", filters.type);
      if (filters.category !== "All") params.set("category", filters.category);
      if (filters.month) params.set("month", filters.month);
      if (filters.date) params.set("date", filters.date);
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
      const qs = params.toString();
      const data = await request(`/transactions${qs ? `?${qs}` : ""}`, { token });
      setTransactions(data);
      setError("");
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  }, [token, filters.type, filters.category, filters.month, filters.date, debouncedSearch, handleError]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  const refreshAll = () => Promise.all([loadSummary(), loadTransactions()]);

  const saveTransaction = async (payload) => {
    if (modal.tx) {
      await request(`/transactions/${modal.tx.id}`, { method: "PUT", body: payload, token });
    } else {
      await request("/transactions", { method: "POST", body: payload, token });
    }
    setModal({ open: false, tx: null });
    await refreshAll();
  };

  const deleteTransaction = async (tx) => {
    if (!window.confirm(`Delete "${tx.title}" (${formatINR(tx.amount)})?`)) return;
    try {
      await request(`/transactions/${tx.id}`, { method: "DELETE", token });
      await refreshAll();
    } catch (err) {
      handleError(err);
    }
  };

  const filteredTotals = useMemo(() => {
    let inc = 0;
    let exp = 0;
    transactions.forEach((t) => (t.type === "Income" ? (inc += t.amount) : (exp += t.amount)));
    return { inc, exp };
  }, [transactions]);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-9 h-9 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-lg">
              ₹
            </span>
            <span className="font-bold text-lg">Expense Manager</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-600 hidden sm:inline">
              Hi, <b>{user.name}</b>
            </span>
            <button
              onClick={onLogout}
              className="text-sm px-3 py-1.5 border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 flex justify-between">
            <span>{error}</span>
            <button onClick={() => setError("")} className="font-bold">
              ×
            </button>
          </div>
        )}

        <SummaryCards summary={summary} />
        <Charts summary={summary} />

        {/* Transactions */}
        <section className="bg-white rounded-2xl shadow p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">Transaction History</h2>
              <p className="text-xs text-slate-500">
                Showing {transactions.length} result{transactions.length === 1 ? "" : "s"} ·{" "}
                <span className="text-emerald-600">+{formatINR(filteredTotals.inc)}</span> ·{" "}
                <span className="text-rose-600">-{formatINR(filteredTotals.exp)}</span>
              </p>
            </div>
            <button
              onClick={() => setModal({ open: true, tx: null })}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-lg shadow"
            >
              + Add Transaction
            </button>
          </div>

          <Filters filters={filters} setFilters={setFilters} />

          <TransactionTable
            transactions={transactions}
            loading={loading}
            onEdit={(tx) => setModal({ open: true, tx })}
            onDelete={deleteTransaction}
          />
        </section>

        <footer className="text-center text-xs text-slate-400 pb-6">
          Expense Manager · All amounts in Indian Rupees (₹)
        </footer>
      </main>

      {modal.open && (
        <TransactionModal
          initial={modal.tx}
          onClose={() => setModal({ open: false, tx: null })}
          onSave={saveTransaction}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Root                                                                */
/* ------------------------------------------------------------------ */
export default function App() {
  const [auth, setAuth] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("em_auth")) || null;
    } catch {
      return null;
    }
  });

  const handleAuth = (data) => {
    localStorage.setItem("em_auth", JSON.stringify(data));
    setAuth(data);
  };

  const handleLogout = useCallback(() => {
    localStorage.removeItem("em_auth");
    setAuth(null);
  }, []);

  if (!auth) return <AuthScreen onAuth={handleAuth} />;
  return <Dashboard auth={auth} onLogout={handleLogout} />;
}
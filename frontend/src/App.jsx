import { useEffect, useMemo, useState } from "react";

const API_URL = "/api/v1/sales";
const EMPTY_FORM = { saleDate: "", amount: "" };

function Icon({ name, size = 18 }) {
  const paths = {
    chart: <><path d="M4 19V9" /><path d="M10 19V5" /><path d="M16 19v-7" /><path d="M22 19H2" /></>,
    sales: <><path d="M6 2h9l4 4v16H6z" /><path d="M14 2v5h5" /><path d="M9 13h7M9 17h5" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    edit: <><path d="m4 20 4.5-1 10-10-3.5-3.5-10 10z" /><path d="m13.5 7 3.5 3.5" /></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6" /></>,
    refresh: <><path d="M20 7v5h-5" /><path d="M19 12a7 7 0 1 0-2 5" /></>,
    database: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" /><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></>,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    arrow: <path d="m9 18 6-6-6-6" />,
  };

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

function formatAmount(value) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2,
  }).format(value);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

async function request(url, options) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.message || `请求失败（${response.status}）`);
  }
  return response.status === 204 ? null : response.json();
}

function App() {
  const [sales, setSales] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState("");
  const [year, setYear] = useState("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadSales = async () => {
    setLoading(true);
    setError("");
    try {
      setSales(await request(API_URL));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSales();
  }, []);

  const filteredSales = useMemo(() => {
    const term = search.trim().toLowerCase();
    return sales.filter((sale) => {
      const matchesYear = year === "all" || sale.saleDate.startsWith(year);
      const matchesSearch =
        !term ||
        String(sale.id).includes(term) ||
        sale.saleDate.includes(term) ||
        String(sale.amount).includes(term);
      return matchesYear && matchesSearch;
    });
  }, [sales, search, year]);

  const summary = useMemo(() => {
    const total = sales.reduce((sum, sale) => sum + Number(sale.amount), 0);
    const years = new Set(sales.map((sale) => sale.saleDate.slice(0, 4)));
    return {
      total,
      count: sales.length,
      average: sales.length ? total / sales.length : 0,
      partitions: years.size,
    };
  }, [sales]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
  };

  const submitSale = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    const payload = { saleDate: form.saleDate, amount: Number(form.amount) };
    try {
      if (editingId) {
        await request(`${API_URL}/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await request(API_URL, {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      resetForm();
      await loadSales();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (sale) => {
    setEditingId(sale.id);
    setForm({ saleDate: sale.saleDate, amount: String(sale.amount) });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const deleteSale = async (sale) => {
    if (!window.confirm(`确定删除 #${sale.id} 的销售记录吗？`)) return;
    setError("");
    try {
      await request(`${API_URL}/${sale.id}`, { method: "DELETE" });
      setSales((current) => current.filter((item) => item.id !== sale.id));
      if (editingId === sale.id) resetForm();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark"><Icon name="chart" /></span><span>Northstar</span></div>
        <nav>
          <a href="#overview" className="nav-item active"><Icon name="sales" />销售管理</a>
          <span className="nav-item muted"><Icon name="database" />分区概览<span className="soon">即将推出</span></span>
        </nav>
        <div className="sidebar-status">
          <span className="status-dot" />
          <div><strong>系统运行正常</strong><small>PostgreSQL 已连接</small></div>
        </div>
      </aside>

      <main id="overview">
        <header>
          <div>
            <p className="eyebrow">数据工作台</p>
            <h1>销售管理</h1>
            <p className="subtitle">查看并维护按年度分区的销售数据</p>
          </div>
          <button className="secondary-button" onClick={loadSales} disabled={loading}><Icon name="refresh" />刷新数据</button>
        </header>

        {error && <div className="error-banner"><span>{error}</span><button onClick={() => setError("")}><Icon name="close" size={16} /></button></div>}

        <section className="metrics">
          <article className="metric-card accent">
            <span className="metric-label">销售总额</span><strong>{formatAmount(summary.total)}</strong><small>全部分区累计</small>
          </article>
          <article className="metric-card">
            <span className="metric-label">销售记录</span><strong>{summary.count}</strong><small>当前数据总量</small>
          </article>
          <article className="metric-card">
            <span className="metric-label">平均金额</span><strong>{formatAmount(summary.average)}</strong><small>每笔销售均值</small>
          </article>
          <article className="metric-card">
            <span className="metric-label">活跃分区</span><strong>{summary.partitions}</strong><small>按销售年份统计</small>
          </article>
        </section>

        <section className="content-grid">
          <article className="panel form-panel">
            <div className="panel-heading">
              <div><span className="section-kicker">{editingId ? "编辑模式" : "新建记录"}</span><h2>{editingId ? `修改销售 #${editingId}` : "录入销售数据"}</h2></div>
              {editingId && <button className="icon-button" onClick={resetForm} title="取消编辑"><Icon name="close" /></button>}
            </div>
            <form onSubmit={submitSale}>
              <label>
                销售日期
                <input type="date" min="2023-01-01" max="2025-12-31" value={form.saleDate} onChange={(event) => setForm({ ...form, saleDate: event.target.value })} required />
                <small>当前支持 2023—2025 年分区</small>
              </label>
              <label>
                销售金额
                <div className="amount-input"><span>¥</span><input type="number" min="0.01" step="0.01" placeholder="0.00" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} required /></div>
              </label>
              <button className="primary-button" type="submit" disabled={saving}>
                {editingId ? <Icon name="edit" /> : <Icon name="plus" />}
                {saving ? "正在保存…" : editingId ? "保存修改" : "添加销售记录"}
              </button>
              {editingId && <button className="text-button" type="button" onClick={resetForm}>取消编辑</button>}
            </form>
            <div className="partition-note"><Icon name="database" /><p><strong>自动路由分区</strong><span>记录会根据销售日期自动写入对应年度分区。</span></p></div>
          </article>

          <article className="panel table-panel">
            <div className="panel-heading table-heading">
              <div><span className="section-kicker">销售明细</span><h2>全部记录 <span className="count">{filteredSales.length}</span></h2></div>
              <div className="filters">
                <div className="search-box"><Icon name="search" size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索编号、日期或金额" /></div>
                <select value={year} onChange={(event) => setYear(event.target.value)} aria-label="按年份筛选">
                  <option value="all">全部年份</option>
                  <option value="2023">2023 年</option>
                  <option value="2024">2024 年</option>
                  <option value="2025">2025 年</option>
                </select>
              </div>
            </div>

            <div className="table-wrap">
              <table>
                <thead><tr><th>记录编号</th><th>销售日期</th><th>所属分区</th><th className="amount-cell">销售金额</th><th className="action-cell">操作</th></tr></thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan="5"><div className="empty-state"><span className="spinner" />正在加载销售数据…</div></td></tr>
                  ) : filteredSales.length === 0 ? (
                    <tr><td colSpan="5"><div className="empty-state"><Icon name="sales" size={32} /><strong>暂无销售记录</strong><span>新增一条记录，或调整当前筛选条件。</span></div></td></tr>
                  ) : filteredSales.map((sale) => (
                    <tr key={sale.id}>
                      <td><span className="record-id">#{String(sale.id).padStart(4, "0")}</span></td>
                      <td>{formatDate(sale.saleDate)}</td>
                      <td><span className="partition-tag"><span />sales_{sale.saleDate.slice(0, 4)}</span></td>
                      <td className="amount-cell"><strong>{formatAmount(sale.amount)}</strong></td>
                      <td className="action-cell">
                        <button className="row-action" onClick={() => startEdit(sale)} title="编辑"><Icon name="edit" size={17} /></button>
                        <button className="row-action danger" onClick={() => deleteSale(sale)} title="删除"><Icon name="trash" size={17} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      </main>
    </div>
  );
}

export default App;

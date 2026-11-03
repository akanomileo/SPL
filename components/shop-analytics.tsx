'use client';
import { useEffect, useState } from 'react';
import { Eye, Users, BarChart3, RefreshCw } from 'lucide-react';
import { api, errorMessage, type ShopAnalytics } from '@/lib/connected';
const dayLabel = (day: string, short = false) =>
  new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(short ? {} : { year: 'numeric' }),
    timeZone: 'Asia/Yangon',
  }).format(new Date(day + 'T00:00:00+06:30'));
export function VisitorAnalytics() {
  const [days, setDays] = useState('30');
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<ShopAnalytics | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const result = await api<ShopAnalytics>(
          `/api/owner/analytics?days=${days}`,
        );
        if (active) {
          setData(result);
          setError('');
        }
      } catch (e) {
        if (active) setError(errorMessage(e));
      }
    };
    void load();
    const timer = setInterval(() => void load(), 60000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [days, revision]);
  const max = Math.max(1, ...(data?.daily.map((d) => d.visitors) ?? []));
  return (
    <section className="visitor-analytics">
      <div className="management-intro">
        <div>
          <h2>Daily shop traffic</h2>
          <p>Customer shop visits · Myanmar time (UTC+06:30)</p>
        </div>
        <div className="portal-actions">
          <label className="analytics-period">
            Date range
            <select value={days} onChange={(e) => setDays(e.target.value)}>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
            </select>
          </label>
          <button
            className="portal-secondary"
            onClick={() => setRevision((n) => n + 1)}
          >
            <RefreshCw size={16} aria-hidden="true" />
            Refresh traffic
          </button>
        </div>
      </div>
      {error && (
        <p className="portal-error" role="alert">
          {error}
        </p>
      )}
      {!data ? (
        <output>Loading shop traffic…</output>
      ) : (
        <>
          <div className="portal-stats management-stats">
            <article>
              <span>
                <Users size={15} aria-hidden="true" />
                Visitors today
              </span>
              <strong>{data.todayCounts.visitors.toLocaleString()}</strong>
              <small>{dayLabel(data.today)}</small>
            </article>
            <article>
              <span>
                <Eye size={15} aria-hidden="true" />
                Shop openings today
              </span>
              <strong>{data.todayCounts.pageViews.toLocaleString()}</strong>
              <small>Includes return visits</small>
            </article>
            <article>
              <span>
                <BarChart3 size={15} aria-hidden="true" />
                Average visitors / day
              </span>
              <strong>
                {(
                  data.totals.visitorDays / Math.max(1, data.trackedDays)
                ).toLocaleString(undefined, { maximumFractionDigits: 1 })}
              </strong>
              <small>
                Over {data.trackedDays} tracked{' '}
                {data.trackedDays === 1 ? 'day' : 'days'}
              </small>
            </article>
          </div>
          <section className="portal-card traffic-card">
            <div className="traffic-chart-title">
              <h3>Visitors by day</h3>
              <span>
                {data.totals.pageViews.toLocaleString()} shop openings in this
                period
              </span>
            </div>
            {!data.firstRecordedDay && (
              <p className="management-empty">
                No visits recorded yet. Tracking starts with this version;
                earlier traffic is not available.
              </p>
            )}
            <div className="traffic-chart-scroll">
              <figure
                className="traffic-chart"
                aria-label={`Daily distinct browser counts for the last ${data.days} days. Exact counts are listed in the table below.`}
              >
                {data.daily.map((d, i) => (
                  <div
                    className="traffic-column"
                    key={d.day}
                    title={
                      d.tracked
                        ? `${dayLabel(d.day)}: ${d.visitors} visitors, ${d.pageViews} openings`
                        : `${dayLabel(d.day)}: tracking unavailable`
                    }
                  >
                    <div className="traffic-bar-area">
                      <span
                        style={{ height: `${(d.visitors / max) * 100}%` }}
                      />
                    </div>
                    <span className="traffic-tick">
                      {i === 0 ||
                      i === data.days - 1 ||
                      i % Math.ceil(data.days / 7) === 0
                        ? dayLabel(d.day, true)
                        : ''}
                    </span>
                  </div>
                ))}
              </figure>
            </div>
          </section>
          <div className="management-table-wrap traffic-table-wrap">
            <table className="management-table traffic-table">
              <caption>Daily visitor counts</caption>
              <thead>
                <tr>
                  <th scope="col">Date (Myanmar)</th>
                  <th scope="col">Visitors</th>
                  <th scope="col">Shop openings</th>
                </tr>
              </thead>
              <tbody>
                {[...data.daily].reverse().map((d) => (
                  <tr key={d.day}>
                    <th scope="row">
                      {dayLabel(d.day)}
                      {d.day === data.today ? ' · Today' : ''}
                    </th>
                    <td>{d.tracked ? d.visitors.toLocaleString() : '—'}</td>
                    <td>{d.tracked ? d.pageViews.toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="management-note">
            Visitors are distinct browsers per day, including guests and
            signed-in customers. The same browser counts once that day;
            reopening the shop adds an opening. Different devices or cleared
            cookies can count again. Owner visits, recognised bots and browsers
            requesting Do Not Track are excluded. No IP addresses are stored.
          </p>
          {data.trackingStartedDay && (
            <p className="management-note">
              Tracking started: {dayLabel(data.trackingStartedDay)}. Earlier
              days are marked —. Counts refresh every minute while this page is
              open.
            </p>
          )}
        </>
      )}
    </section>
  );
}

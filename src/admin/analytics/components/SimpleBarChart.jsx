import { T } from '../../../lib/constants';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function SimpleBarChart({ data, xKey, yKey, height = 200, color = T.v, label }) {
  if (!data || data.length === 0) return null;
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={T.bdr} vertical={false}/>
          <XAxis
            dataKey={xKey}
            tick={{ fontSize: 11, fill: T.mu }}
            axisLine={{ stroke: T.bdr }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: T.mu }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              background: T.w, border: `1px solid ${T.bdr}`,
              borderRadius: 8, fontSize: 12,
            }}
            cursor={{ fill: T.s2 }}
            labelStyle={{ color: T.text, fontWeight: 600 }}
          />
          <Bar dataKey={yKey} fill={color} name={label} radius={[4, 4, 0, 0]}/>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

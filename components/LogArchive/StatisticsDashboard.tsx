import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend } from 'recharts';
import { TrendingUp, Tag as TagIcon, Folder, Calendar, Activity } from 'lucide-react';
import { db } from './db/LogArchiveDB';
import { getTagColor } from './utils';

/**
 * Statistics Dashboard
 * 
 * 아카이브 통계를 시각화하는 대시보드
 */
export function StatisticsDashboard() {
    const [summary, setSummary] = useState<{
        totalArchives: number;
        totalTags: number;
        totalFolders: number;
        mostUsedTags: Array<{ tag: string; count: number }>;
        recentArchives: number;
    } | null>(null);

    const [tagStats, setTagStats] = useState<Array<{ name: string; value: number }>>([]);
    const [folderStats, setFolderStats] = useState<Array<{ name: string; value: number }>>([]);
    const [dailyTrend, setDailyTrend] = useState<Array<{ date: string; count: number }>>([]);
    const [isLoading, setIsLoading] = useState(true);

    /**
     * 통계 데이터 로드
     */
    useEffect(() => {
        loadStatistics();
    }, []);

    const loadStatistics = async () => {
        setIsLoading(true);
        try {
            // 전체 요약
            const summaryData = await db.getStatisticsSummary();
            setSummary(summaryData);

            // 태그 통계
            const tagData = await db.getTagStatistics();
            const tagArray = Object.entries(tagData)
                .map(([name, value]) => ({ name, value }))
                .sort((a, b) => b.value - a.value)
                .slice(0, 10); // 상위 10개
            setTagStats(tagArray);

            // 폴더 통계
            const folderData = await db.getFolderStatistics();
            const folderArray = Object.entries(folderData)
                .map(([name, value]) => ({ name, value }))
                .sort((a, b) => b.value - a.value);
            setFolderStats(folderArray);

            // 일별 트렌드 (최근 30일)
            const trendData = await db.getDailyTrend(30);
            setDailyTrend(trendData);
        } catch (error) {
            console.error('[StatisticsDashboard] Failed to load statistics:', error);
        } finally {
            setIsLoading(false);
        }
    };

    if (isLoading) {
        return (
            <div className="statistics-dashboard-loading">
                <div className="spinner" />
                <p>Loading statistics...</p>
            </div>
        );
    }

    if (!summary) {
        return (
            <div className="statistics-dashboard-empty">
                <p>No statistics available</p>
            </div>
        );
    }

    return (
        <div className="statistics-dashboard">
            {/* Summary Cards */}
            <div className="stats-summary-grid">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="stat-card"
                >
                    <div className="stat-icon total">
                        <Activity size={24} />
                    </div>
                    <div className="stat-content">
                        <h3>Total Archives</h3>
                        <p className="stat-value">{summary.totalArchives}</p>
                        <span className="stat-label">All time</span>
                    </div>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="stat-card"
                >
                    <div className="stat-icon recent">
                        <TrendingUp size={24} />
                    </div>
                    <div className="stat-content">
                        <h3>Recent Activity</h3>
                        <p className="stat-value">{summary.recentArchives}</p>
                        <span className="stat-label">Last 7 days</span>
                    </div>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="stat-card"
                >
                    <div className="stat-icon tags">
                        <TagIcon size={24} />
                    </div>
                    <div className="stat-content">
                        <h3>Unique Tags</h3>
                        <p className="stat-value">{summary.totalTags}</p>
                        <span className="stat-label">Categories</span>
                    </div>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="stat-card"
                >
                    <div className="stat-icon folders">
                        <Folder size={24} />
                    </div>
                    <div className="stat-content">
                        <h3>Folders</h3>
                        <p className="stat-value">{summary.totalFolders}</p>
                        <span className="stat-label">Collections</span>
                    </div>
                </motion.div>
            </div>

            {/* Charts Grid */}
            <div className="stats-charts-grid">
                {/* Daily Trend */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    className="chart-card full-width"
                >
                    <h3 className="chart-title">
                        <Calendar size={18} />
                        <span>Daily Activity (Last 30 Days)</span>
                    </h3>
                    <ResponsiveContainer width="100%" height={250}>
                        <LineChart data={dailyTrend}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                            <XAxis
                                dataKey="date"
                                stroke="#94a3b8"
                                tick={{ fontSize: 12 }}
                                tickFormatter={(value) => {
                                    const date = new Date(value);
                                    return `${date.getMonth() + 1}/${date.getDate()}`;
                                }}
                            />
                            <YAxis stroke="#94a3b8" tick={{ fontSize: 12 }} />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: '#1e293b',
                                    border: '1px solid #334155',
                                    borderRadius: '6px',
                                    color: '#f1f5f9',
                                }}
                                labelFormatter={(value: any) => {
                                    const date = new Date(value);
                                    return date.toLocaleDateString();
                                }}
                            />
                            <Legend />
                            <Line
                                type="monotone"
                                dataKey="count"
                                stroke="#3b82f6"
                                strokeWidth={2}
                                dot={{ fill: '#3b82f6', r: 4 }}
                                activeDot={{ r: 6 }}
                                name="Archives Created"
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </motion.div>

                {/* Top Tags */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 }}
                    className="chart-card"
                >
                    <h3 className="chart-title">
                        <TagIcon size={18} />
                        <span>Top 10 Tags</span>
                    </h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={tagStats} layout="vertical">
                            <XAxis type="number" stroke="#94a3b8" tick={{ fontSize: 12 }} />
                            <YAxis
                                type="category"
                                dataKey="name"
                                stroke="#94a3b8"
                                tick={{ fontSize: 12 }}
                                width={100}
                            />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: '#1e293b',
                                    border: '1px solid #334155',
                                    borderRadius: '6px',
                                    color: '#f1f5f9',
                                }}
                            />
                            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                                {tagStats.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={getTagColor(entry.name)} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </motion.div>

                {/* Folder Distribution */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.7 }}
                    className="chart-card"
                >
                    <h3 className="chart-title">
                        <Folder size={18} />
                        <span>Folder Distribution</span>
                    </h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                            <Pie
                                data={folderStats}
                                dataKey="value"
                                nameKey="name"
                                cx="50%"
                                cy="50%"
                                outerRadius={100}
                                label={({ name, value }) => `${name}: ${value}`}
                                labelLine={{ stroke: '#94a3b8' }}
                            >
                                {folderStats.map((entry, index) => {
                                    const colors = [
                                        '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b',
                                        '#10b981', '#06b6d4', '#f97316', '#6366f1',
                                    ];
                                    return (
                                        <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                                    );
                                })}
                            </Pie>
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: '#1e293b',
                                    border: '1px solid #334155',
                                    borderRadius: '6px',
                                    color: '#f1f5f9',
                                }}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                </motion.div>

                {/* Most Used Tags */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.8 }}
                    className="chart-card full-width"
                >
                    <h3 className="chart-title">
                        <TrendingUp size={18} />
                        <span>Most Used Tags</span>
                    </h3>
                    <div className="tag-list">
                        {summary.mostUsedTags.map((item, index) => (
                            <div key={item.tag} className="tag-item">
                                <div className="tag-rank">#{index + 1}</div>
                                <div
                                    className="tag-badge"
                                    style={{ backgroundColor: getTagColor(item.tag) }}
                                >
                                    {item.tag}
                                </div>
                                <div className="tag-count">{item.count} archives</div>
                            </div>
                        ))}
                    </div>
                </motion.div>
            </div>
        </div>
    );
}

'use client'

import { useState } from 'react'
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from 'lucide-react'
import Sidebar from './Sidebar'
import MarketPanel from './MarketPanel'
import StatsCards from './trade/StatsCards'
import PairSelector from './trade/PairSelector'
import OrderEntryPanel from './trade/OrderEntryPanel'
import DepthChart from './trade/DepthChart'
import OpenOrdersTable from './trade/OpenOrdersTable'
import ActivityLog from './trade/ActivityLog'
import BalanceCards from './portfolio/BalanceCards'
import YieldDashboard from './portfolio/YieldDashboard'
import PriceChart from './portfolio/PriceChart'
import FillHistory from './portfolio/FillHistory'
import { TRADING_PAIRS, type TradingPair } from '@/lib/clob'

export default function Dashboard() {
  const [mode, setMode] = useState<'trade' | 'portfolio'>('trade')
  const [leftOpen, setLeftOpen] = useState(true)
  const [rightOpen, setRightOpen] = useState(true)
  const [selectedPair, setSelectedPair] = useState<TradingPair>(TRADING_PAIRS[0])

  return (
    <div
      className="flex h-screen overflow-y-auto overflow-x-hidden"
      style={{ background: 'var(--db-bg-deep)', color: 'var(--db-text-primary)' }}
    >
      {leftOpen && <Sidebar mode={mode} onModeChange={setMode} />}

      <main
        className="flex-1 min-w-0 transition-all duration-300"
        style={{ marginLeft: leftOpen ? 220 : 0 }}
      >
        <header className="db-topbar">
          <div className="flex items-center gap-3">
            <button onClick={() => setLeftOpen(!leftOpen)} className="db-icon-btn">
              {leftOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
            </button>
            <div>
              <h2 className="db-topbar-title">{mode === 'trade' ? 'Trade' : 'Portfolio'}</h2>
              <p className="db-topbar-sub">nyx CLOB</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="db-status-badge">
              <div className="db-status-dot" style={{ background: 'var(--db-neon-cyan)', animation: 'db-pulse 2s infinite' }} />
              <span style={{ color: 'var(--db-neon-cyan)' }}>Asset Hub</span>
            </div>
            <button onClick={() => setRightOpen(!rightOpen)} className="db-icon-btn">
              {rightOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
            </button>
          </div>
        </header>

        <div className="p-6 space-y-4">
          {mode === 'trade' ? (
            <>
              <StatsCards />
              <PairSelector selectedPair={selectedPair} onSelect={setSelectedPair} />
              <div className="grid grid-cols-3 gap-4">
                <OrderEntryPanel pair={selectedPair} />
                <div className="col-span-2">
                  <DepthChart />
                </div>
              </div>
              <PriceChart compact />
              <ActivityLog />
              <OpenOrdersTable />
            </>
          ) : (
            <>
              <BalanceCards />
              <YieldDashboard />
              <PriceChart />
              <FillHistory />
            </>
          )}
        </div>
      </main>

      {rightOpen && (
        <aside className="w-[280px] shrink-0 db-card m-3 ml-0 self-start sticky top-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 1.5rem)' }}>
          <MarketPanel />
        </aside>
      )}
    </div>
  )
}

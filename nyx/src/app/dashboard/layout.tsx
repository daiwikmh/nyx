import { DashboardProviders } from './providers'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardProviders>
      {/* Force dark mode — trading dashboard is always dark */}
      <div className="dark">
        {children}
      </div>
    </DashboardProviders>
  )
}

import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Lab Inventory Manager',
  description: 'Manage lab inventory locally without cloud dependencies',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  )
}

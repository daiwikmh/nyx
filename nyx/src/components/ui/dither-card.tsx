"use client"

import { useEffect, useState } from "react"

export function DitherCard() {
  const [cursor, setCursor] = useState(true)

  useEffect(() => {
    const interval = setInterval(() => setCursor((c) => !c), 530)
    return () => clearInterval(interval)
  }, [])

  const blink = cursor ? "█" : " "

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between border-b-2 border-foreground px-4 py-2">
        <span className="text-[10px] tracking-widest text-muted-foreground uppercase">
          warden_terminal.crt
        </span>
        <span className="text-[10px] tracking-widest text-[#ea580c] animate-blink">PWR</span>
      </div>
      <div className="flex-1 flex items-center justify-center bg-background overflow-hidden">
        <pre className="text-[6.5px] sm:text-[8px] md:text-[9px] leading-[1.25] font-mono select-none px-1 py-2 text-foreground whitespace-pre">
{`

██████╗   ██████╗  ██╗      ██╗  ██╗  █████╗  ██╗   ██╗ ███╗   ███╗
██╔══██╗ ██╔═══██╗ ██║      ██║ ██╔╝ ██╔══██╗ ██║   ██║ ████╗ ████║
██████╔╝ ██║   ██║ ██║      █████╔╝  ███████║ ██║   ██║ ██╔████╔██║
██╔═══╝  ██║   ██║ ██║      ██╔═██╗  ██╔══██║ ╚██╗ ██╔╝ ██║╚██╔╝██║
██║      ╚██████╔╝ ███████╗ ██║  ██╗ ██║  ██║ ╚ ████╔╝  ██║ ╚═╝ ██║
`}
        </pre>
      </div>
    </div>
  )
}

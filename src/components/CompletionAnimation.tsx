'use client'

import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export function CompletionAnimation({ taskId, onComplete }: { taskId: string; onComplete: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onComplete, 900)
    return () => clearTimeout(timer)
  }, [onComplete])

  return (
    <AnimatePresence>
      <motion.div
        key={taskId}
        data-testid="completion-animation"
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: 1.1 }}
        exit={{ opacity: 0, scale: 1.4 }}
        transition={{ duration: 0.6 }}
        className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center"
      >
        <span className="text-6xl">✅</span>
      </motion.div>
    </AnimatePresence>
  )
}

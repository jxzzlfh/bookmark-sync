'use client';

import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  description: string;
}

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-white/10 flex items-center justify-center mb-6 animate-float">
        <Inbox className="w-10 h-10 text-blue-400" />
      </div>
      <h3 className="text-xl font-display font-semibold text-white mb-2">{title}</h3>
      <p className="text-slate-400 text-center max-w-md">{description}</p>
    </div>
  );
}

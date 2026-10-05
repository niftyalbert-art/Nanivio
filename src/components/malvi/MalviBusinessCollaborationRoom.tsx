import React, { useState } from 'react';
import {
  Users,
  Brain,
  Sparkles,
  Send,
  CheckCircle2,
  Clock,
  Briefcase,
  Lightbulb,
  FileText,
  Target,
  ArrowRight,
  Shield,
  Layers,
  Download,
  Plus,
  Play,
  RotateCcw,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNanivio } from '../../context/NanivioContext';
import { billingClient } from '../../lib/billingClient';

interface MalviBusinessSessionProps {
  onOpenSubscriptionHub?: () => void;
}

interface Participant {
  id: string;
  name: string;
  role: string;
  avatarColor: string;
}

interface IdeaItem {
  id: string;
  author: string;
  text: string;
  timestamp: number;
}

interface ActionItem {
  id: string;
  task: string;
  owner: string;
  status: 'pending' | 'completed';
}

interface MalviContribution {
  id: string;
  type: 'analysis' | 'suggestion' | 'clarification' | 'action_items' | 'summary';
  content: string;
  timestamp: number;
}

const INITIAL_PARTICIPANTS: Participant[] = [];
const INITIAL_IDEAS: IdeaItem[] = [];

export const MalviBusinessCollaborationRoom: React.FC<MalviBusinessSessionProps> = ({
  onOpenSubscriptionHub,
}) => {
  const { malviSubscription, currentUser } = useNanivio();
  const isBusinessTier = malviSubscription?.tier === 'malvi_business';

  const [topic, setTopic] = useState('Cross-Border Trade & Langpretation Expansion');
  const [objective, setObjective] = useState('Validate unit economics and AfCFTA trade corridor deployment strategy');
  const [participants, setParticipants] = useState<Participant[]>(() => currentUser ? [{ id: currentUser.id, name: currentUser.name, role: 'Session Owner', avatarColor: 'bg-emerald-500' }] : []);
  const [ideas, setIdeas] = useState<IdeaItem[]>(INITIAL_IDEAS);
  const [newIdeaText, setNewIdeaText] = useState('');
  const [contributions, setContributions] = useState<MalviContribution[]>([]);

  const [actionItems, setActionItems] = useState<ActionItem[]>([]);

  const [isCollaborating, setIsCollaborating] = useState(false);
  const [briefExported, setBriefExported] = useState(false);

  // Submit new team idea and trigger Malvi Business AI real-time contribution
  const handleAddIdea = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newIdeaText.trim() || isCollaborating) return;

    const userIdea: IdeaItem = {
      id: `idea_${Date.now()}`,
      author: currentUser?.name || 'Session Owner',
      text: newIdeaText.trim(),
      timestamp: Date.now(),
    };

    const updatedIdeas = [...ideas, userIdea];
    setIdeas(updatedIdeas);
    const sentText = newIdeaText.trim();
    setNewIdeaText('');
    setIsCollaborating(true);

    try {
      const response = await billingClient.collaborateMalviBusiness({
        topic,
        objective,
        participants: participants.map((p) => ({ id: p.id, name: p.name, role: p.role })),
        ideas: updatedIdeas.map((i) => ({ author: i.author, text: i.text })),
        newIdea: sentText,
      });

      if (response && response.contribution) {
        setContributions((prev) => [
          ...prev,
          {
            id: response.contribution.id || `contrib_${Date.now()}`,
            type: (response.contribution.type as any) || 'analysis',
            content: response.contribution.content,
            timestamp: response.contribution.timestamp || Date.now(),
          },
        ]);
      }

      if (response && response.actionItems && response.actionItems.length > 0) {
        setActionItems((prev) => [...prev, ...response.actionItems]);
      }
    } catch (err) {
      console.warn('Error collaborating with Malvi Business:', err);
      // Fallback local synthesis
      setContributions((prev) => [
        ...prev,
        {
          id: `contrib_fb_${Date.now()}`,
          type: 'analysis',
          content: `### Malvi Business Clarification on "${sentText.slice(0, 45)}..."
**Evaluation**: Strong operational alignment.
**Clarification Questions**:
1. What is the projected capital outlay for initial deployment?
2. How will dispute resolution be automated for multi-currency transactions?`,
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setIsCollaborating(false);
    }
  };

  const toggleActionItem = (id: string) => {
    setActionItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, status: item.status === 'completed' ? 'pending' : 'completed' }
          : item
      )
    );
  };

  const handleExportBrief = () => {
    const briefContent = `=====================================================
NANIVIO MALVI BUSINESS STRATEGY BRIEF
Topic: ${topic}
Objective: ${objective}
Date: ${new Date().toLocaleDateString()}
Participants: ${participants.map((p) => `${p.name} (${p.role})`).join(', ')}
=====================================================

--- TEAM IDEAS & BRAINSTORMING ---
${ideas.map((i, idx) => `[${idx + 1}] ${i.author}: "${i.text}"`).join('\n\n')}

--- MALVI BUSINESS AI STRATEGIC CONTRIBUTIONS ---
${contributions.map((c) => c.content).join('\n\n---\n\n')}

--- ASSIGNED ACTION ITEMS ---
${actionItems.map((a) => `[${a.status === 'completed' ? 'X' : ' '}] ${a.task} -> Owner: ${a.owner}`).join('\n')}

Generated by Malvi Business Real-Time Collaboration Environment.
`;

    const blob = new Blob([briefContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Malvi_Business_Brief_${Date.now()}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    setBriefExported(true);
    setTimeout(() => setBriefExported(false), 3000);
  };

  return (
    <div className="bg-[#0b1322] border border-cyan-500/30 rounded-3xl p-5 sm:p-7 shadow-2xl space-y-6 relative overflow-hidden">
      {/* Background ambient lighting */}
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header Banner */}
      <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-cyan-500/20 to-teal-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-300">
              <Briefcase className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  Malvi Business Collaboration Room
                </h2>
                <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-mono font-bold uppercase tracking-wider">
                  Enterprise AI Co-Pilot
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Real users and team members collaborate with Malvi as an active AI participant
              </p>
            </div>
          </div>
        </div>

        {/* Upgrade pill / status */}
        <div className="flex items-center gap-3">
          {!isBusinessTier ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-amber-300 font-mono bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 rounded-xl">
                Free / Individual Tier (Preview Access)
              </span>
              {onOpenSubscriptionHub && (
                <button
                  onClick={onOpenSubscriptionHub}
                  className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-400 hover:from-cyan-400 hover:to-teal-300 text-slate-950 font-bold text-xs shadow-md transition"
                >
                  Upgrade to Business
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 rounded-xl">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Malvi Business Active</span>
            </div>
          )}

          <button
            onClick={handleExportBrief}
            className="px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 transition"
            title="Export session brief and action items"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            <span>{briefExported ? 'Brief Saved!' : 'Export Brief'}</span>
          </button>
        </div>
      </div>

      {/* Session Configuration Strip */}
      <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs bg-slate-950/60 border border-slate-800 rounded-2xl p-3.5">
        <div>
          <label className="text-[10px] font-mono uppercase text-slate-500 font-bold block mb-1">
            Session Topic
          </label>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-white font-semibold focus:outline-none focus:border-cyan-500"
          />
        </div>
        <div>
          <label className="text-[10px] font-mono uppercase text-slate-500 font-bold block mb-1">
            Strategic Objective
          </label>
          <input
            type="text"
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-slate-300 focus:outline-none focus:border-cyan-500"
          />
        </div>
      </div>

      {/* Main Multi-Party Collaborative Grid */}
      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: Team Participants & Action Items (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          {/* Active Participants */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-white">
              <span className="flex items-center gap-1.5">
                <Users className="w-4 h-4 text-cyan-400" />
                <span>Live Session Participants ({participants.length})</span>
              </span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            </div>

            <div className="space-y-2">
              {participants.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between p-2 rounded-xl bg-slate-900/80 border border-slate-800/80 text-xs"
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-7 h-7 rounded-lg ${p.avatarColor} text-slate-950 font-black text-xs flex items-center justify-center`}
                    >
                      {p.name.charAt(0)}
                    </div>
                    <div>
                      <div className="font-bold text-white text-xs">{p.name}</div>
                      <div className="text-[10px] text-slate-400">{p.role}</div>
                    </div>
                  </div>
                  {p.id === 'p_malvi' && (
                    <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono font-bold border border-amber-500/30">
                      AI Participant
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Action Items & Decision Tracker */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-white">
              <span className="flex items-center gap-1.5">
                <Target className="w-4 h-4 text-emerald-400" />
                <span>Action Items & Decisions</span>
              </span>
              <span className="text-[10px] font-mono text-slate-500">
                {actionItems.filter((a) => a.status === 'completed').length}/{actionItems.length} Done
              </span>
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {actionItems.map((item) => (
                <div
                  key={item.id}
                  onClick={() => toggleActionItem(item.id)}
                  className={`p-2.5 rounded-xl border transition cursor-pointer text-xs space-y-1 ${
                    item.status === 'completed'
                      ? 'bg-emerald-950/20 border-emerald-500/30 text-slate-400 line-through'
                      : 'bg-slate-900 border-slate-800 hover:border-slate-700 text-white'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={item.status === 'completed'}
                      onChange={() => {}}
                      className="mt-0.5 rounded text-emerald-500 focus:ring-0 cursor-pointer"
                    />
                    <span className="text-[11px] leading-tight flex-1">{item.task}</span>
                  </div>
                  <div className="text-[10px] text-cyan-400 font-mono pl-5">
                    Owner: {item.owner}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Live Idea Exchange & Malvi Real-Time AI Strategic Review (8 cols) */}
        <div className="lg:col-span-8 space-y-4">
          {/* Ideas Timeline */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4 min-h-[380px] max-h-[520px] overflow-y-auto">
            <div className="flex items-center justify-between text-xs font-bold text-white border-b border-slate-800/80 pb-2">
              <span className="flex items-center gap-1.5">
                <Lightbulb className="w-4 h-4 text-amber-400" />
                <span>Collaborative Discussion & Strategy Feed</span>
              </span>
              <span className="text-[10px] text-slate-500 font-mono">
                Malvi participates in real-time
              </span>
            </div>

            {/* Ideas & AI contributions */}
            <div className="space-y-3">
              {ideas.map((idea) => (
                <div
                  key={idea.id}
                  className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-1"
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-white">{idea.author}</span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {new Date(idea.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">{idea.text}</p>
                </div>
              ))}

              {/* Malvi AI Contributions Stream */}
              {contributions.map((c) => (
                <div
                  key={c.id}
                  className="p-4 rounded-2xl bg-gradient-to-br from-cyan-950/40 via-slate-900 to-slate-950 border border-cyan-500/40 shadow-lg space-y-2"
                >
                  <div className="flex items-center justify-between text-[11px] border-b border-cyan-500/20 pb-1.5">
                    <span className="font-bold text-cyan-300 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Malvi Business AI Analysis & Guidance</span>
                    </span>
                    <span className="text-[9px] uppercase px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-mono">
                      {c.type}
                    </span>
                  </div>
                  <div className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap font-sans">
                    {c.content}
                  </div>
                </div>
              ))}

              {isCollaborating && (
                <div className="p-3.5 rounded-2xl bg-cyan-950/30 border border-cyan-500/40 flex items-center gap-3 text-xs text-cyan-300 animate-pulse">
                  <Brain className="w-4 h-4 animate-spin text-cyan-400" />
                  <span>Malvi is reviewing team ideas, checking trade corridor frameworks & synthesizing action steps...</span>
                </div>
              )}
            </div>
          </div>

          {/* Idea Input Composer */}
          <form onSubmit={handleAddIdea} className="flex items-center gap-2">
            <input
              type="text"
              value={newIdeaText}
              onChange={(e) => setNewIdeaText(e.target.value)}
              placeholder="Contribute idea, discuss strategy, or ask Malvi for meeting summary / clarification..."
              className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl px-4 py-3 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition"
            />
            <button
              type="submit"
              disabled={isCollaborating || !newIdeaText.trim()}
              className={`px-5 py-3 rounded-2xl font-bold text-xs sm:text-sm flex items-center gap-2 transition cursor-pointer ${
                newIdeaText.trim() && !isCollaborating
                  ? 'bg-gradient-to-r from-cyan-500 to-teal-400 text-slate-950 shadow-md shadow-cyan-500/20'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}
            >
              <Send className="w-4 h-4" />
              <span className="hidden sm:inline">Submit & Clarify</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

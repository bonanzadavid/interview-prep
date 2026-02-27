import React, { useState, useEffect, useRef } from 'react';
import {
    Mic,
    Upload,
    Play,
    BarChart3,
    Award,
    User,
    Settings,
    CheckCircle2,
    AlertCircle,
    ChevronRight,
    Loader2,
    FileAudio,
    Video,
    X,
    Trophy,
    History,
    Briefcase,
    Code2,
    Users,
    BrainCircuit,
    MessageSquare,
    Zap,
    BookOpen,
    FileText
} from 'lucide-react';

/**
* InterviewPrep AI
* A single-file React application for interview training.
*/

// --- API Configuration ---
const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

// --- Types ---
type Mode = 'dashboard' | 'simulate' | 'upload' | 'results' | 'history';

interface FeedbackMetric {
    score: number;
    analysis: string;
    tips: string[];
}

interface InterviewSession {
    id: string;
    date: string;
    type: string;
    score: number;
    feedback: {
        summary: string;
        clarity: FeedbackMetric;
        content: FeedbackMetric;
        confidence: FeedbackMetric;
        transcriptSnippet: string;
    };
}

interface UserProfile {
    name: string;
    level: number;
    xp: number;
    nextLevelXp: number;
    totalInterviews: number;
    averageScore: number;
    history: InterviewSession[];
}

// --- Constants ---
const QUESTIONS = {
    Behavioral: [
        "Tell me about a time you failed.",
        "Describe a conflict you faced at work and how you handled it.",
        "What is your greatest strength and weakness?",
        "Give an example of how you set goals and achieve them."
    ],
    Technical: [
        "Explain the concept of Big O notation.",
        "How does the internet work?",
        "Describe a challenging technical problem you solved.",
        "What is the difference between REST and GraphQL?"
    ],
    Leadership: [
        "How do you motivate a team that is feeling burnt out?",
        "Describe your management style.",
        "How do you handle an underperforming team member?",
        "Tell me about a time you had to lead a project."
    ]
};

// --- AI Helper Functions ---

const clampScore = (score: number): number => Math.round(Math.min(100, Math.max(0, score)));

const analyzeWithGemini = async (question: string, transcript: string, type: string): Promise<InterviewSession['feedback'] & { overallScore: number }> => {
    if (!transcript || transcript.trim().length < 10) {
        return {
            overallScore: 0,
            summary: "The answer provided was too short to analyze accurately. Try to explain your thoughts in more detail.",
            clarity: { score: 0, analysis: "N/A", tips: ["Speak clearly into the microphone."] },
            content: { score: 0, analysis: "N/A", tips: ["Provide a substantial answer using the STAR method."] },
            confidence: { score: 0, analysis: "N/A", tips: ["Try to sound more assertive."] },
            transcriptSnippet: transcript.substring(0, 50) + "..."
        };
    }

    const systemPrompt = "You are an expert interview coach for students. Evaluate interview answers based on the STAR method. CRITICAL RULE: All scores MUST be integers between 0 and 100. A score of 50 means average, 75 means good, 90 means excellent, and 30 means poor. NEVER use a 1-10 scale. A weak answer should score around 30-45, a decent answer 55-70, and a strong answer 75-90.";
    const userQuery = ` Question: "${question}" Candidate's Answer (${type} Interview): "${transcript}" Provide
            your analysis in the following JSON format. Ensure all "score" fields are integers between 0 and 100:
            { "overallScore" : 85, "summary" : "Clear and concise explanation of the situation." , "clarity" : { "score"
            : 90, "analysis" : "Very easy to follow." , "tips" : ["Avoid filler words"] }, "content" : { "score" :
            80, "analysis" : "Good use of STAR method." , "tips" : ["Quantify your results more"] }, "confidence" :
            { "score" : 85, "analysis" : "Tone was steady and professional." , "tips" : ["Smile more while speaking"]
            }, "transcriptSnippet" : "Short excerpt of the answer" } `;

    const fetchWithRetry = async (retries = 5, delay = 1000): Promise<any> => {
        try {
            if (!apiKey) {
                throw new Error("API Key is missing. Please set VITE_GEMINI_API_KEY in your .env file.");
            }
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ role: "user", parts: [{ text: userQuery }] }],
                        systemInstruction: { parts: [{ text: systemPrompt }] },
                        generationConfig: {
                            responseMimeType: "application/json",
                            temperature: 0.7
                        }
                    })
                }
            );

            if (!response.ok) {
                if (retries > 0 && (response.status === 429 || response.status >= 500)) {
                    await new Promise(res => setTimeout(res, delay));
                    return fetchWithRetry(retries - 1, delay * 2);
                }
                throw new Error(`API returned status ${response.status}`);
            }

            const data = await response.json();
            let textResult = data.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!textResult) throw new Error("No text data returned from AI.");

            const result = JSON.parse(textResult.replace(/```json\n?/, '').replace(/```\n?$/, '').trim());

            return {
                ...result,
                overallScore: clampScore(result.overallScore),
                clarity: { ...result.clarity, score: clampScore(result.clarity.score) },
                content: { ...result.content, score: clampScore(result.content.score) },
                confidence: { ...result.confidence, score: clampScore(result.confidence.score) }
            };
        } catch (error) {
            if (retries > 0) {
                await new Promise(res => setTimeout(res, delay));
                return fetchWithRetry(retries - 1, delay * 2);
            }
            throw error;
        }
    };

    try {
        return await fetchWithRetry();
    } catch (error: any) {
        console.error("AI Analysis Final Failure:", error);
        return {
            overallScore: 0,
            summary: error.message || "We couldn't reach the AI coach. Please check your connection.",
            clarity: { score: 0, analysis: "Connection error.", tips: [] },
            content: { score: 0, analysis: "Connection error.", tips: [] },
            confidence: { score: 0, analysis: "Connection error.", tips: [] },
            transcriptSnippet: "Failed."
        };
    }
};

// --- Main App ---
export default function App() {
    const [mode, setMode] = useState<Mode>('dashboard');
    const [user, setUser] = useState<UserProfile>({
        name: "Guest Candidate",
        level: 0,
        xp: 0,
        nextLevelXp: 500,
        totalInterviews: 0,
        averageScore: 0,
        history: []
    });

    const [currentSession, setCurrentSession] = useState<InterviewSession | null>(null);

    const addXp = (amount: number) => {
        setUser((prev: UserProfile) => {
            let newXp = prev.xp + amount;
            let newLevel = prev.level;
            let newNextLevelXp = prev.nextLevelXp;
            while (newXp >= newNextLevelXp) {
                newLevel += 1;
                newXp = newXp - newNextLevelXp;
                newNextLevelXp = Math.floor(newNextLevelXp * 1.2);
            }
            return { ...prev, level: newLevel, xp: newXp, nextLevelXp: newNextLevelXp };
        });
    };

    const saveSession = (session: InterviewSession) => {
        setUser((prev: UserProfile) => {
            const newTotal = prev.totalInterviews + 1;
            const newAvg = Math.round(((prev.averageScore * prev.totalInterviews) + session.score) /
                newTotal);
            return {
                ...prev,
                totalInterviews: newTotal,
                averageScore: newAvg,
                history: [session, ...prev.history]
            };
        });
        setCurrentSession(session);
        setMode('results');
    };

    const renderDashboard = () => (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div
                    className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl p-6 text-white shadow-lg">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-indigo-200 font-medium text-sm">Experience Level</p>
                            <h2 className="text-4xl font-bold mt-1">{user.level}</h2>
                        </div>
                        <Trophy className="w-8 h-8 text-yellow-300" />
                    </div>
                    <div className="mt-4">
                        <div className="flex justify-between text-xs mb-1 opacity-90">
                            <span>{user.xp} XP</span>
                            <span>{user.nextLevelXp} XP</span>
                        </div>
                        <div className="w-full bg-indigo-900/40 rounded-full h-2">
                            <div className="bg-yellow-400 h-2 rounded-full transition-all duration-1000"
                                style={{ width: `${(user.xp / user.nextLevelXp) * 100}%` }}></div>
                        </div>
                    </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-slate-500 font-medium text-sm">Average Grade</p>
                            <h2 className="text-4xl font-bold mt-1 text-slate-800">{user.averageScore}
                            </h2>
                        </div>
                        <Award className="w-8 h-8 text-emerald-500" />
                    </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-slate-500 font-medium text-sm">Interviews</p>
                            <h2 className="text-4xl font-bold mt-1 text-slate-800">
                                {user.totalInterviews}</h2>
                        </div>
                        <History className="w-8 h-8 text-blue-500" />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <button onClick={() => setMode('simulate')} className="group bg-white border-2
                                    border-slate-100 hover:border-indigo-500 rounded-2xl p-8 text-left transition-all
                                    hover:shadow-xl">
                    <div
                        className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center mb-4 text-indigo-600">
                        <Mic className="w-6 h-6" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-800 mb-2">Simulate Interview</h3>
                    <p className="text-slate-500 text-sm leading-relaxed">Live voice simulator to
                        practice your STAR method timing and tone.</p>
                </button>
                <button onClick={() => setMode('upload')} className="group bg-white border-2
                                    border-slate-100 hover:border-emerald-500 rounded-2xl p-8 text-left transition-all
                                    hover:shadow-xl">
                    <div
                        className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center mb-4 text-emerald-600">
                        <FileText className="w-6 h-6" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-800 mb-2">Analyze Transcript</h3>
                    <p className="text-slate-500 text-sm leading-relaxed">Paste your written answers or
                        full transcripts for a deep AI breakdown.</p>
                </button>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                <h3 className="text-lg font-bold text-slate-800 mb-4">Recent Sessions</h3>
                <div className="space-y-4">
                    {user.history.length === 0 && <p className="text-slate-400 text-sm">Start practicing to track your growth!</p>}
                    {user.history.slice(0, 5).map((session, i) => (
                        <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                            <div className="flex items-center space-x-4">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${session.score >= 80 ? 'bg-emerald-100 text-emerald-600' : 'bg-indigo-100 text-indigo-600'}`}>
                                    {session.score}
                                </div>
                                <div>
                                    <h4 className="font-semibold text-slate-800 text-sm">{session.type}</h4>
                                    <p className="text-xs text-slate-500">{session.date}</p>
                                </div>
                            </div>
                            <ChevronRight className="w-4 h-4 text-slate-300" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex">
            <aside
                className="hidden md:flex flex-col w-64 bg-white border-r border-slate-200 fixed h-full z-10">
                <div className="p-6">
                    <div className="flex items-center gap-2 mb-8">
                        <div
                            className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold">
                            I</div>
                        <span
                            className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600">InterviewPrep</span>
                    </div>
                    <nav className="space-y-1">
                        <NavButton active={mode === 'dashboard'} onClick={() => setMode('dashboard')}
                            icon={
                                <BarChart3 size={18} />} label="Dashboard" />
                        <NavButton active={mode === 'simulate'} onClick={() => setMode('simulate')}
                            icon={
                                <Mic size={18} />} label="Simulator" />
                        <NavButton active={mode === 'upload'} onClick={() => setMode('upload')}
                            icon={
                                <Upload size={18} />} label="Analyze Text" />
                    </nav>
                </div>
            </aside>

            <main className="flex-1 md:ml-64 p-4 md:p-8 overflow-y-auto">
                {mode === 'dashboard' && renderDashboard()}
                {mode === 'simulate' && <SimulatorView onFinish={saveSession} onCancel={() =>
                    setMode('dashboard')} addXp={addXp} />}
                {mode === 'upload' && <UploadView onFinish={saveSession} onCancel={() =>
                    setMode('dashboard')} addXp={addXp} />}
                {mode === 'results' && currentSession && <ResultsView session={currentSession}
                    onBack={() => setMode('dashboard')} />}
            </main>
        </div>
    );
}

// --- Sub-Components ---
const NavButton = ({ active, onClick, icon, label }: any) => (
    <button onClick={onClick} className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg
                            transition-all text-sm ${active ? 'bg-indigo-50 text-indigo-600 font-bold'
            : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}>
        {icon} <span>{label}</span>
    </button>
);

const SimulatorView = ({ onFinish, onCancel, addXp }: any) => {
    const [step, setStep] = useState<'select' | 'interview' | 'grading'>('select');
    const [category, setCategory] = useState<string>('Behavioral');
    const [question, setQuestion] = useState("");
    const [isRecording, setIsRecording] = useState(false);
    const [timer, setTimer] = useState(0);
    const [transcript, setTranscript] = useState('');
    const [liveTranscript, setLiveTranscript] = useState('');
    const [recognition, setRecognition] = useState<any>(null);

    useEffect(() => {
        const SpeechRec = (window as any).SpeechRecognition || (window as
            any).webkitSpeechRecognition;
        if (SpeechRec) {
            const recog = new SpeechRec();
            recog.continuous = true;
            recog.interimResults = true;
            recog.lang = 'en-US';
            recog.onresult = (e: any) => {
                let interim = '';
                let final = '';
                for (let i = e.resultIndex; i < e.results.length; ++i) {
                    if (e.results[i].isFinal)
                        final += e.results[i][0].transcript; else interim += e.results[i][0].transcript;
                }
                if (final) setTranscript(p => p + ' ' + final);
                setLiveTranscript(interim);
            };
            setRecognition(recog);
        }
    }, []);

    useEffect(() => {
        let interval: any;
        if (isRecording) interval = setInterval(() => setTimer((t: number) => t + 1), 1000);
        else setTimer(0);
        return () => clearInterval(interval);
    }, [isRecording]);

    const toggleRecording = () => {
        if (isRecording) {
            recognition?.stop();
            setIsRecording(false);
        } else {
            setTranscript('');
            setLiveTranscript('');
            recognition?.start();
            setIsRecording(true);
        }
    };

    const startInterview = (cat: string) => {
        const qList = QUESTIONS[cat as keyof typeof QUESTIONS];
        setQuestion(qList[Math.floor(Math.random() * qList.length)]);
        setCategory(cat);
        setStep('interview');
    };

    const finishSimulation = async () => {
        if (isRecording) recognition?.stop();
        setStep('grading');
        const finalAnswer = (transcript + ' ' + liveTranscript).trim();
        const aiFeedback = await analyzeWithGemini(question, finalAnswer, category);
        addXp(aiFeedback.overallScore * 5);
        onFinish({
            id: Date.now().toString(),
            date: new Date().toLocaleDateString(),
            type: category,
            score: aiFeedback.overallScore,
            feedback: aiFeedback
        });
    };

    if (step === 'grading') {
        return (
            <div
                className="flex flex-col items-center justify-center min-h-[60vh] text-center">
                <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mb-4" />
                <h2 className="text-2xl font-bold text-slate-800">Analyzing Your Voice</h2>
                <p className="text-slate-500 mt-2">Checking STAR points, tone, and
                    clarity...</p>
            </div>
        );
    }

    if (step === 'select') {
        return (
            <div className="max-w-4xl mx-auto">
                <h1 className="text-3xl font-bold text-slate-800 mb-8">Choose Your Track
                </h1>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <TrackCard icon={<Users className="text-blue-500" />} title="Behavioral"
                        desc="STAR method practice." onClick={() =>
                            startInterview('Behavioral')} />
                    <TrackCard icon={<Code2 className="text-emerald-500" />}
                        title="Technical" desc="Foundational concepts." onClick={() =>
                            startInterview('Technical')} />
                    <TrackCard icon={<Briefcase className="text-purple-500" />}
                        title="Leadership" desc="Team management." onClick={() =>
                            startInterview('Leadership')} />
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-2xl mx-auto py-12 text-center">
            <div className="bg-white rounded-3xl shadow-lg border p-12">
                <h2 className="text-2xl md:text-3xl font-bold text-slate-800 mb-8">
                    {question}</h2>
                <div
                    className="mb-8 p-4 bg-slate-50 rounded-xl border text-sm text-left h-32 overflow-y-auto">
                    <span className="text-slate-600">{transcript} </span>
                    <span className="text-indigo-400 italic">{liveTranscript}</span>
                </div>
                {!isRecording ? (
                    <button onClick={toggleRecording}
                        className="bg-indigo-600 text-white px-8 py-3 rounded-full font-bold flex items-center gap-2 mx-auto shadow-lg hover:bg-indigo-700">
                        <Mic size={20} /> {transcript ? "Resume" : "Start Answering"}
                    </button>
                ) : (
                    <div className="flex flex-col items-center gap-4">
                        <div
                            className="text-red-500 font-mono text-xl font-bold flex items-center gap-2">
                            <span
                                className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></span>
                            {Math.floor(timer / 60)}:{String(timer % 60).padStart(2, '0')}
                        </div>
                        <button onClick={toggleRecording}
                            className="bg-slate-100 text-slate-700 px-6 py-2 rounded-full font-bold">Pause</button>
                    </div>
                )}
                {transcript && !isRecording && (
                    <button onClick={finishSimulation}
                        className="mt-8 text-indigo-600 font-bold hover:underline">Grade My
                        Response</button>
                )}
            </div>
        </div>
    );
};

const TrackCard = ({ icon, title, desc, onClick }: any) => (
    <button onClick={onClick}
        className="bg-white border p-8 rounded-2xl hover:border-indigo-500 hover:shadow-lg transition-all text-left">
        <div
            className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center mb-4">
            {icon}</div>
        <h3 className="font-bold text-lg">{title}</h3>
        <p className="text-sm text-slate-500 mt-1">{desc}</p>
    </button>
);

const UploadView = ({ onFinish, addXp }: any) => {
    const [text, setText] = useState('');
    const [loading, setLoading] = useState(false);
    const handleAnalyze = async () => {
        setLoading(true);
        const feedback = await analyzeWithGemini("Written Analysis", text,
            "Transcript");
        addXp(feedback.overallScore * 3);
        onFinish({
            id: Date.now().toString(),
            date: new Date().toLocaleDateString(),
            type: "Transcript",
            score: feedback.overallScore,
            feedback
        });
    };
    return (
        <div className="max-w-2xl mx-auto py-8">
            <div className="bg-white border rounded-2xl p-6 shadow-sm">
                <h2 className="text-xl font-bold mb-4">Paste Interview Transcript</h2>
                <textarea
                    className="w-full h-64 p-4 rounded-xl border border-slate-200 outline-none focus:border-indigo-500 transition-all text-sm"
                    placeholder="Paste text here to analyze..." value={text}
                    onChange={(e) => setText(e.target.value)}
                />
                <button
                    onClick={handleAnalyze}
                    disabled={loading || text.length < 20}
                    className="w-full mt-4 bg-indigo-600 text-white py-3 rounded-xl font-bold disabled:opacity-50 flex items-center justify-center gap-2"
                >
                    {loading ? <Loader2 className="animate-spin" /> : <Zap size={18} />}
                    {loading ? "Analyzing..." : "Analyze with AI"}
                </button>
            </div>
        </div>
    );
};

const ResultsView = ({ session, onBack }: any) => (
    <div className="max-w-4xl mx-auto py-8 animate-in fade-in slide-in-from-bottom-4">
        <button onClick={onBack} className="flex items-center gap-2 text-slate-500 mb-6 hover:text-slate-800">
            <X size={18} /> Back to Dashboard
        </button>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-1 space-y-6">
                <div className="bg-white border rounded-3xl p-8 text-center shadow-sm">
                    <p className="text-xs font-bold text-slate-400 uppercase mb-2">Overall Score</p>
                    <h1 className="text-7xl font-black text-slate-800">{session.score}</h1>
                    <p className={`mt-2 font-bold ${session.score >= 80 ? 'text-emerald-500' : 'text-slate-500'}`}>
                        {session.score >= 80 ? 'Exceptional' : 'Keep Practicing'}
                    </p>
                </div>
                <div className="bg-indigo-600 rounded-2xl p-6 text-white shadow-lg">
                    <h4 className="font-bold flex items-center gap-2 mb-2"><Award size={18} /> AI Summary</h4>
                    <p className="text-sm opacity-90 leading-relaxed">{session.feedback.summary}</p>
                </div>
            </div>
            <div className="md:col-span-2 space-y-4">
                <MetricBar title="Clarity" score={session.feedback.clarity.score} analysis={session.feedback.clarity.analysis} tips={session.feedback.clarity.tips} />
                <MetricBar title="Content" score={session.feedback.content.score} analysis={session.feedback.content.analysis} tips={session.feedback.content.tips} />
                <MetricBar title="Confidence" score={session.feedback.confidence.score} analysis={session.feedback.confidence.analysis} tips={session.feedback.confidence.tips} />
            </div>
        </div>
    </div>
);

const MetricBar = ({ title, score, analysis, tips }: any) => (
    <div className="bg-white border rounded-2xl p-6 shadow-sm">
        <div className="flex justify-between items-center mb-2">
            <h4 className="font-bold text-slate-800">{title}</h4>
            <span className="font-bold text-indigo-600 text-lg">{score}/100</span>
        </div>
        <div className="w-full bg-slate-100 h-2 rounded-full mb-4 overflow-hidden">
            <div className="bg-indigo-500 h-full rounded-full transition-all duration-1000" style={{ width: `${score}%` }}></div>
        </div>
        <p className="text-sm text-slate-600 mb-4">{analysis}</p>
        <div className="flex flex-wrap gap-2">
            {tips.map((tip: string, i: number) => (
                <span key={i} className="text-[10px] bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full font-bold border border-indigo-100">💡 {tip}</span>
            ))}
        </div>
    </div>
);

import Link from 'next/link';
import type { ReactNode } from 'react';
import { CopyBlock } from '@/components/workshop/CopyBlock';
import { ModuleDone } from '@/components/workshop/ModuleDone';
import { PriorityScorer } from '@/components/workshop/PriorityScorer';
import {
  FAQ,
  MISSING,
  MODULES,
  PROMPTS,
  TEMPLATES,
  TOOLS,
  TROUBLESHOOTING,
  WORKSHOP,
  type ModuleId,
  type Prompt,
} from '@/content/workshop';

const ext = { target: '_blank', rel: 'noopener noreferrer' } as const;

function Module({ id, lead, children }: { id: ModuleId; lead: string; children: ReactNode }) {
  const m = MODULES.find((x) => x.id === id)!;
  return (
    <section id={id} className="module" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="module__title">
        <span className="module__num">{m.num}.</span> {m.title}
      </h2>
      <p className="module__lead">{lead}</p>
      {children}
      <ModuleDone id={id} title={m.title} />
    </section>
  );
}

/** Expandable lesson. */
function Lesson({ title, open, children }: { title: string; open?: boolean; children: ReactNode }) {
  return (
    <details className="lesson" open={open}>
      <summary>{title}</summary>
      <div className="lesson__body prose">{children}</div>
    </details>
  );
}

function Exercise({
  title,
  time,
  children,
}: {
  title: string;
  time?: string;
  children: ReactNode;
}) {
  return (
    <div className="exercise">
      <p className="exercise__tag">Try it{time && <span> · {time}</span>}</p>
      <h3 className="exercise__title">{title}</h3>
      <div className="prose">{children}</div>
    </div>
  );
}

/** Marks content that goes beyond what was said in the workshop. */
function Beyond({ children }: { children: ReactNode }) {
  return (
    <p className="beyond">
      <strong>Beyond the workshop:</strong> {children}
    </p>
  );
}

function PromptBlock({ prompt }: { prompt: Prompt }) {
  return <CopyBlock label={prompt.label} text={prompt.text} source={prompt.source} />;
}

/* ─── 01 ───────────────────────────────────────────────── */
export function OverviewModule() {
  const quick = [
    { href: '#recording', title: 'Workshop recording', text: 'Coming soon' },
    { href: '#models', title: 'Lecture notes', text: 'Key ideas, module by module' },
    { href: '#prompts', title: 'Copyable prompts', text: 'Ready-to-use prompts' },
    { href: '#twin', title: 'Exercises', text: 'Hands-on practice' },
  ];
  return (
    <Module
      id="overview"
      lead="Learn how to turn Claude into a personal AI assistant, your digital twin, that understands your context, helps you prioritize, and takes real work off your plate. You stay in charge of what it sees and what it is allowed to do."
    >
      <div className="overview-grid">
        <div id="recording" className="video-slot">
          {WORKSHOP.recordingEmbedUrl ? (
            <iframe
              src={WORKSHOP.recordingEmbedUrl}
              title={`Recording: ${WORKSHOP.title}`}
              allow="fullscreen; picture-in-picture"
              loading="lazy"
            />
          ) : (
            <div className="video-slot__empty">
              <p className="video-slot__kicker">Workshop recording</p>
              <p className="video-slot__title">Coming soon</p>
              <p>
                The recording has not been published yet. This page covers the main ideas in the
                meantime.
              </p>
            </div>
          )}
        </div>
        <aside className="takeaways" aria-labelledby="takeaways-title">
          <h3 id="takeaways-title">Key takeaways</h3>
          <ul>
            <li>Choose the right Claude model and effort level for the task</li>
            <li>Give Claude context with projects, Markdown files and skills</li>
            <li>Build a digital twin that interviews you before it assumes</li>
            <li>Turn your to-do list into a prioritization dashboard</li>
            <li>Connect Gmail, Slack and Notion, and decide what needs your approval</li>
            <li>Prototype apps with Claude Code, Vite + React and Lovable</li>
          </ul>
        </aside>
      </div>

      <ul className="quick-links">
        {quick.map((q) => (
          <li key={q.href}>
            <a href={q.href}>
              <strong>{q.title}</strong>
              <span>{q.text}</span>
            </a>
          </li>
        ))}
      </ul>

      <Lesson title="What the workshop set out to do" open>
        <p>
          The workshop was a hands-on session for students, faculty, researchers and professionals.
          No developer experience was needed. By the end, participants were working on two things:
        </p>
        <ul>
          <li>an AI chief-of-staff workflow that organizes projects and priorities, and</li>
          <li>a first app or dashboard prototype built with Claude.</li>
        </ul>
        <p>Along the way, it covered:</p>
        <ul>
          <li>how to delegate work to AI and give it useful context,</li>
          <li>multi-step AI workflows for data and research, and</li>
          <li>where human judgment still matters.</li>
        </ul>
      </Lesson>

      <div className="instructor">
        <img
          src={WORKSHOP.instructor.image}
          alt={`Portrait of Prof. ${WORKSHOP.instructor.name}`}
          width={96}
          height={96}
          loading="lazy"
        />
        <div>
          <p className="eyebrow">Instructor</p>
          <h3>Prof. {WORKSHOP.instructor.name}</h3>
          <p className="muted">
            {WORKSHOP.instructor.title}, {WORKSHOP.instructor.school}. He teaches and researches how
            people and AI divide work, and builds with Claude every day, from research dashboards to
            a bird-watching app.
          </p>
          <p className="instructor__links">
            <a href={WORKSHOP.instructor.website} {...ext}>
              Personal website ↗
            </a>
            <a href={WORKSHOP.lumaUrl} {...ext}>
              Original event page on Luma ↗
            </a>
          </p>
        </div>
      </div>
    </Module>
  );
}

/* ─── 02 ───────────────────────────────────────────────── */
export function ModelsModule() {
  const models = [
    { name: 'Haiku', form: 'a very short poem', use: 'Quick, simple questions.' },
    { name: 'Sonnet 5.5', form: 'a poem', use: 'Shorter, easier tasks, and when speed matters.' },
    {
      name: 'Opus 5.5',
      form: 'a medium-length story',
      use: 'Hard, important work. The instructor’s default for anything that needs real thinking.',
    },
    {
      name: 'Fable',
      form: 'a very long story',
      use: 'The largest model. The instructor found Opus 5.5 much more cost-efficient for his work.',
    },
  ];
  const efforts = [
    { level: 'Low / Medium', when: 'Only for very easy questions you know have a quick answer.' },
    { level: 'High', when: 'The instructor’s setting about 90% of the time.' },
    {
      level: 'Extra high',
      when: 'Really hard work where you want the model to iterate back and forth.',
    },
    {
      level: 'Max',
      when: 'Rarely. When you want new ideas and are fine with the model thinking for a long time, potentially hours.',
    },
  ];
  return (
    <Module
      id="models"
      lead="Every request trades off speed, quality and how fast you use up your plan. Pick a model for how hard the task is, then pick an effort level for how much thinking it deserves."
    >
      <Lesson title="Which model? Think of the names as lengths" open>
        <p>
          Claude’s model names are literary forms, from shortest to longest. The bigger the model,
          the more capable it is, and the more of your usage it consumes.
        </p>
        <div className="table-wrap">
          <table className="data data--wrap">
            <thead>
              <tr>
                <th scope="col">Model</th>
                <th scope="col">Like…</th>
                <th scope="col">When the instructor uses it</th>
              </tr>
            </thead>
            <tbody>
              {models.map((m) => (
                <tr key={m.name}>
                  <th scope="row">{m.name}</th>
                  <td>{m.form}</td>
                  <td>{m.use}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          In practice he uses only Opus and Sonnet. For a task like setting up a digital twin, where
          the model has to think through every part of your work, choose Opus. In the live demo he
          used Sonnet only to save time.
        </p>
        <p className="small-print">
          Model names and versions as of October 2026. They change often.
        </p>
      </Lesson>

      <Lesson title="Effort: how long should Claude think?">
        <p>
          Next to the model picker you can set an effort level: low, medium, high, extra high or
          max. Higher effort means more reasoning before answering. It is slower and uses more of
          your plan.
        </p>
        <dl className="effort-list">
          {efforts.map((e) => (
            <div key={e.level}>
              <dt>{e.level}</dt>
              <dd>{e.when}</dd>
            </div>
          ))}
        </dl>
      </Lesson>

      <Lesson title="Keep an eye on usage">
        <p>
          Settings → Usage shows how much of your plan you have used. There is a limit every five
          hours and a weekly limit. Using the strongest model and highest effort for everything is
          the fastest way to hit them.
        </p>
      </Lesson>

      <Exercise title="Compare two models on the same task" time="10 min">
        <ol>
          <li>Open two new chats with the same file attached (any syllabus or long PDF works).</li>
          <li>
            Set the first to Sonnet 5.5, effort high. Set the second to Opus 5.5, effort high.
          </li>
          <li>Paste the prompt below into both.</li>
          <li>
            Compare: How long did each take? Which plan would you actually follow? Was the
            difference worth the extra usage?
          </li>
        </ol>
        <PromptBlock prompt={PROMPTS.compare} />
        <p>
          Optional: run Opus again at extra high and see whether the plan improves enough to justify
          the wait.
        </p>
      </Exercise>
    </Module>
  );
}

/* ─── 03 ───────────────────────────────────────────────── */
export function ContextModule() {
  return (
    <Module
      id="context"
      lead="Context engineering means setting Claude up with the right information about you and your work, so it can help without you re-explaining everything in every chat."
    >
      <Lesson title="Projects and memory" open>
        <p>
          A project groups conversations and files about one thing, so Claude carries context from
          one chat to the next. The instructor keeps one project per big area of his life, for
          example teaching, and his wildfire research. Start by listing the three or four big things
          you are doing and make a project for each.
        </p>
        <p>
          Turning on memory in settings lets Claude remember what you have done together, so each
          new chat starts with some knowledge of who you are.
        </p>
      </Lesson>

      <Lesson title="Markdown files as your personal knowledge base">
        <p>
          Markdown files are plain text files (ending in <code>.md</code>) with simple formatting.
          They are the standard way to hand an AI information about you. Keep them in one folder,
          and Claude can read them whenever it works there.
        </p>
        <p>
          The workshop demo stored a chief of staff’s whole knowledge base this way. More advanced
          setups use a knowledge graph or connect to note apps, but plain files are enough to start.
        </p>
      </Lesson>

      <Lesson title="Connecting Claude to a project folder">
        <p>
          In the Claude desktop app, Cowork and Code let Claude work inside a folder on your
          computer. When you start a session you choose two things:
        </p>
        <ul>
          <li>
            <strong>Where Claude runs.</strong> On your computer, it can use your local files but
            the session stays on that machine. In the cloud, you can pick the session up from any
            device, including your phone.
          </li>
          <li>
            <strong>Which folder(s) it may use.</strong> Give it only the folders it needs. Cowork
            can combine several related project folders in one session.
          </li>
        </ul>
        <p>
          Newer versions of the app merged Chat and Cowork. If you do not see Cowork, use a regular
          chat and give it access to your folder.
        </p>
      </Lesson>

      <Lesson title="Skills: teach Claude your way of doing things">
        <p>
          Claude has a default taste, and it is the same for everyone. Ask ten people to make slides
          with Claude and you get the same font, colors and layout. A skill is a saved set of
          instructions Claude loads automatically when a task calls for it. You can create one just
          by telling Claude how you want something done and asking it to make that a skill.
        </p>
        <p>Examples from the workshop:</p>
        <ul>
          <li>a slide-deck style, with one title, one message and one image per slide,</li>
          <li>
            a writing style that makes text sound human, with no em dashes and no inflated words,
          </li>
          <li>a fixed workflow, like a reimbursement request or a multi-step data analysis.</li>
        </ul>
        <p>
          Skills can be combined, so keep each one small and focused. Revisit them when models
          improve. Skills for judgment-heavy work often need updates, while format-only skills tend
          to keep working.
        </p>
        <PromptBlock prompt={PROMPTS.slideSkill} />
        <p>
          SMC keeps ready-made career skills in the{' '}
          <Link href="/skills">Claude Skills Library</Link>.
        </p>
      </Lesson>

      <h3 className="module__h3">Starter templates for your knowledge base</h3>
      <Beyond>
        these four files are SMC starter templates, not files shown in the workshop. Fill in only
        what you are comfortable sharing, and keep the files on your own computer.
      </Beyond>
      <div className="template-grid">
        {TEMPLATES.map((t) => (
          <div key={t.file}>
            <p className="template-grid__purpose">{t.purpose}</p>
            <CopyBlock label={t.file} text={t.body} file />
          </div>
        ))}
      </div>
    </Module>
  );
}

/* ─── 04 ───────────────────────────────────────────────── */
export function TwinModule() {
  return (
    <Module
      id="twin"
      lead="A digital twin is a Claude setup that knows your goals, projects, people and preferences well enough to act like a chief of staff. In the workshop it took one prompt and a short interview to get started."
    >
      <Exercise title="Set up your digital twin" time="15 min">
        <ol>
          <li>
            Create an empty folder on your computer called <code>Digital Twin</code>.
          </li>
          <li>
            In the Claude desktop app, start a Cowork session (or a chat with folder access) and add
            that folder. Allow Claude to change files in it.
          </li>
          <li>Choose Opus 5.5 so it thinks carefully about your work. Sonnet 5.5 is faster.</li>
          <li>
            Choose how approvals work. If you are new to delegating to Claude, keep manual approval
            on so you can see each step.
          </li>
          <li>
            Paste the prompt below, fill in the brackets, and answer Claude’s interview questions.
          </li>
        </ol>
        <PromptBlock prompt={PROMPTS.twin} />
        <p>
          Already built one? Ask Claude to turn it into a proactive dashboard instead. Module 05
          shows how.
        </p>
      </Exercise>

      <Lesson title="Why “interview me” matters" open>
        <p>
          Left alone, the model makes a lot of assumptions. Asking it to interview you about
          anything that is an assumption or an open question makes it check with you first. In the
          demo, Claude asked:
        </p>
        <ul>
          <li>which folders it may read (and it skipped API keys),</li>
          <li>what the chief of staff should do day to day,</li>
          <li>how much it may do alone: only read, read and draft proposals, or edit files, and</li>
          <li>
            how to store the knowledge base. The instructor chose Markdown files plus a dashboard.
          </li>
        </ul>
      </Lesson>

      <Lesson title="What to put in your twin">
        <p>
          Organize what your twin knows around a few questions. The starter templates in Module 03
          map to them.
        </p>
        <ul>
          <li>
            <strong>Personal goals</strong>: what you want this quarter and this year (
            <code>goals.md</code>).
          </li>
          <li>
            <strong>Professional context</strong>: your program, background, and the people you work
            with (<code>about-me.md</code>).
          </li>
          <li>
            <strong>Projects</strong>: what is in flight, next actions, and who is blocking what (
            <code>projects.md</code>).
          </li>
          <li>
            <strong>Work and decision preferences</strong>: when you focus best, and how you want
            options presented (<code>preferences.md</code>).
          </li>
          <li>
            <strong>Communication style</strong>: tone and words to avoid, so drafts sound like you.
          </li>
        </ul>
        <Beyond>
          to keep it current, ask Claude to update these files at the end of a work session. Delete
          anything that is no longer true.
        </Beyond>
      </Lesson>

      <Lesson title="Privacy: decide what you are comfortable sharing">
        <p>
          A useful chief of staff needs access to a lot of your data. The instructor gives broad
          access because he values convenience, and he was clear that everyone should pick their own
          level of risk.
        </p>
        <ul>
          <li>
            <strong>Some data you are not allowed to share.</strong> He does not give his UW email
            or student data to his personal Claude account. Check your school’s and employer’s rules
            before connecting work accounts.
          </li>
          <li>
            <strong>Exclude sensitive folders.</strong> Keep banking, passwords and API keys out of
            the folders you grant.
          </li>
          <li>
            <strong>Check training settings.</strong> If you do not want your chats used to train
            future models, turn off “Help improve Claude” in Settings → Privacy. Then read the{' '}
            <a href="https://privacy.claude.com/en/" {...ext}>
              privacy center
            </a>{' '}
            to understand what still happens to your data.
          </li>
        </ul>
        <p>
          Nothing on this page asks you to upload or publish anything. Your files stay with you.
        </p>
      </Lesson>
    </Module>
  );
}

/* ─── 05 ───────────────────────────────────────────────── */
export function DashboardModule() {
  return (
    <Module
      id="dashboard"
      lead="Once your twin knows your work, ask it for a dashboard. Seeing everything at once helps you step back, notice where you are the bottleneck, and choose what to do next."
    >
      <Lesson title="What the instructor’s dashboards do" open>
        <ul>
          <li>
            Show every research paper by stage, from early idea to under review, and where he is the
            one blocking progress.
          </li>
          <li>
            Estimate how long each unblock takes, so a free hour or ten minutes can go to the
            quickest wins.
          </li>
          <li>
            Score every task on how important it is for his career, how much joy it brings, and how
            quick a win it is. They also separate important from merely urgent.
          </li>
          <li>Review the week every Sunday evening, so wins get noticed and celebrated.</li>
        </ul>
        <p>
          The dashboard Claude builds is an artifact: an interactive page made inside the chat that
          you can keep using.
        </p>
      </Lesson>

      <h3 className="module__h3">Try the scoring yourself</h3>
      <p className="muted">
        Move the sliders and the list re-ranks. This is an illustrative model: each task scores 1–5
        on Career, Joy and Urgency, and the total is a simple sum. The workshop did not give a
        formula, so tune it to what matters to you. Nothing you type here is saved or sent.
      </p>
      <PriorityScorer />

      <h3 id="prompts" className="module__h3">
        Prompts for your chief of staff
      </h3>
      <div className="prompt-stack">
        <PromptBlock prompt={PROMPTS.score} />
        <PromptBlock prompt={PROMPTS.hour} />
        <PromptBlock prompt={PROMPTS.weekly} />
      </div>
    </Module>
  );
}

/* ─── 06 ───────────────────────────────────────────────── */
export function IntegrationsModule() {
  const workflows = [
    {
      title: 'Meeting → action items',
      steps:
        'Record the meeting with a transcription tool → the transcript goes to Claude → Claude lists action items and drafts follow-ups for you to review.',
      access: 'Transcription app account, plus a Claude connector or folder access.',
    },
    {
      title: 'Weekly opportunity search',
      steps:
        'A scheduled task runs once a week → searches for grants, awards or events that fit you → drafts a short summary or a first application.',
      access: 'Scheduled tasks in Claude; web search turned on.',
    },
    {
      title: 'Fill out a form or draft an email',
      steps:
        'Computer use opens the browser → fills in details from your knowledge base → stops so you can check and press send or submit.',
      access: 'Computer use permission for the browser or app; you approve the final step.',
    },
  ];
  return (
    <Module
      id="integrations"
      lead="Connected to your tools, Claude can gather context and take actions for you. Every connection needs you to sign in and grant access, and you decide which steps need your approval."
    >
      <Lesson title="Connectors: Gmail, Google Workspace, Slack, Notion" open>
        <p>
          Connectors in Settings let Claude read from, and sometimes act in, the apps you use. The
          instructor connected his personal Gmail, Google Drive and Google Calendar, plus Slack.
          Notion, Canva, Google Docs and Sheets are also available. Each one asks you to sign in and
          approve what Claude can access.
        </p>
        <ul>
          <li>
            Many universities and companies block connecting work accounts. UW does for his
            Microsoft account, so he connects only accounts he manages himself.
          </li>
          <li>
            At the time of the workshop the app supported one Gmail account. A Gmail and an Outlook
            account could be connected together.
          </li>
        </ul>
        <p>
          Learn more:{' '}
          <a
            href="https://support.claude.com/en/articles/11176164-use-connectors-to-extend-claude-s-capabilities"
            {...ext}
          >
            using connectors
          </a>
          .
        </p>
      </Lesson>

      <Lesson title="Voice transcription">
        <p>
          The instructor dictates prompts and records meetings with{' '}
          <a href="https://wisprflow.ai" {...ext}>
            Wispr Flow
          </a>
          , a paid subscription that he prefers to Claude’s built-in voice input. Once a meeting
          transcript reaches Claude, it already has the context to suggest action items.
        </p>
      </Lesson>

      <Lesson title="Computer use">
        <p>
          With computer use, Claude can operate a browser or app on your screen. In the live demo it
          opened Outlook and drafted an email. Before acting, it listed its plan, ending with “send
          after user approval.” Things to know:
        </p>
        <ul>
          <li>
            It is slow and uses a lot of compute, because Claude has to look at screenshots. Hand it
            a task and come back later.
          </li>
          <li>
            Some apps are read-only for Claude. It can see the window but not click or type, and it
            will tell you so.
          </li>
          <li>
            If your prompt is vague, it may ask what you mean, or it may assume. Check the result
            before anything is sent.
          </li>
        </ul>
      </Lesson>

      <Lesson title="Approvals: where should a human step in?">
        <p>
          You can approve every action manually or let Claude skip approvals. The instructor skips
          them because he has built up trust over time. He recommends that beginners approve
          manually until they know how Claude behaves. To decide, ask yourself:
        </p>
        <ul>
          <li>How much attention do I have for checking?</li>
          <li>How costly would a mistake be if it slipped through?</li>
          <li>Would I let a new human assistant do this step without asking me?</li>
        </ul>
      </Lesson>

      <h3 className="module__h3">Example workflows</h3>
      <ul className="workflow-grid">
        {workflows.map((w) => (
          <li key={w.title} className="workflow">
            <h4>{w.title}</h4>
            <p>{w.steps}</p>
            <p className="workflow__access">
              <strong>Needs:</strong> {w.access}
            </p>
          </li>
        ))}
      </ul>
    </Module>
  );
}

/* ─── 07 ───────────────────────────────────────────────── */
export function BuildModule() {
  const styles = [
    { name: 'Glassmorphism', text: 'See-through, frosted-glass panels. A look Apple uses a lot.' },
    {
      name: 'Claymorphism',
      text: 'Soft, puffy, playful shapes. Fun for a startup or restaurant, less so for an academic.',
    },
    {
      name: 'Neumorphism',
      text: 'Soft shadows that make elements look pressed into the page. Popular six or seven years ago.',
    },
    {
      name: 'Neo-brutalism',
      text: 'Sharp corners, vivid colors and hard shadows, borrowed from architecture.',
    },
    {
      name: 'Editorial',
      text: 'Like a newspaper. Serif fonts feel upscale; sans-serif fonts feel modern.',
    },
  ];
  return (
    <Module
      id="build"
      lead="Instead of handing in a report, turn your project into something people can use. Explore the look with mockups first, then have Claude build it."
    >
      <Lesson title="Design first: ask for mockups" open>
        <p>
          Ask Claude for a mockup before any code. Even better, ask for several versions side by
          side. The instructor generated a page of 20 different looks for his personal website from
          a single prompt, then mixed elements he liked from different styles.
        </p>
        <ul className="style-list">
          {styles.map((s) => (
            <li key={s.name}>
              <strong>{s.name}</strong> {s.text}
            </li>
          ))}
        </ul>
        <PromptBlock prompt={PROMPTS.mockups} />
      </Lesson>

      <Lesson title="Build with Claude Code, Vite and React">
        <p>
          In Claude Code, create a new folder for the project and describe the app you want. By
          default Claude often writes plain HTML, which is quick but limited. Adding two words,
          “Vite and React,” gets you an app with richer visuals and interactions that works on
          phones and every browser.
        </p>
        <p>
          The same lesson applies beyond web design: one keyword of domain knowledge can change the
          result. For his ocean-protection map, Claude’s first solution protected scattered,
          impractical patches. Asking for integer programming produced connected areas that made
          sense.
        </p>
      </Lesson>

      <Lesson title="Prototype with Lovable">
        <p>
          <a href="https://lovable.dev" {...ext}>
            Lovable
          </a>{' '}
          builds a working website from a prompt. Last year the instructor’s 84 students each used
          it to make a personal page and a site for a real local business that had none. His
          bird-watching app combined Claude, ChatGPT and Lovable across more than 4,000 prompts.
        </p>
      </Lesson>

      <Lesson title="Put it online">
        <Beyond>
          the workshop did not cover deployment. A common free option for a Vite + React app is{' '}
          <a href="https://vercel.com/docs/frameworks/frontend/vite" {...ext}>
            Vercel
          </a>
          : push your project to GitHub, import the repository in Vercel, and it detects Vite
          automatically. You can also ask Claude Code to walk you through it.
        </Beyond>
      </Lesson>

      <Exercise title="Build a one-page app for a project of yours" time="20–30 min">
        <ol>
          <li>Pick a class project, case competition or dataset you know well.</li>
          <li>Create a new folder and open it in Claude Code.</li>
          <li>Ask for two or three mockups first, and pick one.</li>
          <li>Paste the prompt below to build it, then iterate in small steps.</li>
          <li>Open it on your phone. Does the main point land in five seconds?</li>
        </ol>
        <PromptBlock prompt={PROMPTS.app} />
      </Exercise>
    </Module>
  );
}

/* ─── 08 ───────────────────────────────────────────────── */
export function ResourcesModule() {
  const prompts = Object.values(PROMPTS);
  return (
    <Module
      id="resources"
      lead="Everything in one place: the recording and notes as they become available, all prompts from this page, recommended tools, and answers to common questions."
    >
      <ul className="resource-grid">
        <li className="resource">
          <h3>Workshop recording</h3>
          {WORKSHOP.recordingEmbedUrl ? (
            <a href="#recording">Watch the recording</a>
          ) : (
            <p className="muted">Coming soon.</p>
          )}
        </li>
        <li className="resource">
          <h3>Lecture notes</h3>
          {WORKSHOP.notesUrl ? (
            <a href={WORKSHOP.notesUrl} {...ext}>
              Open the lecture notes ↗
            </a>
          ) : (
            <p className="muted">
              Modules 02–07 on this page summarize the session. The instructor’s edited notes are
              coming soon.
            </p>
          )}
        </li>
        <li className="resource">
          <h3>Screenshots</h3>
          <p className="muted">Demo screenshots are coming soon.</p>
        </li>
        <li className="resource">
          <h3>Event page</h3>
          <a href={WORKSHOP.lumaUrl} {...ext}>
            View on Luma ↗
          </a>
        </li>
      </ul>

      <Lesson title={`All prompts (${prompts.length})`}>
        <div className="prompt-stack">
          {prompts.map((p) => (
            <PromptBlock key={p.id} prompt={p} />
          ))}
        </div>
      </Lesson>

      <h3 className="module__h3">Recommended tools</h3>
      <ul className="tool-grid">
        {TOOLS.map((t) => (
          <li key={t.href}>
            <a href={t.href} {...ext}>
              {t.label} <span aria-hidden="true">↗</span>
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
            <span>{t.note}</span>
          </li>
        ))}
      </ul>

      <h3 className="module__h3">Frequently asked questions</h3>
      <div className="faq">
        {FAQ.map((f) => (
          <details key={f.q} className="lesson">
            <summary>{f.q}</summary>
            <div className="lesson__body prose">
              <p>{f.a}</p>
            </div>
          </details>
        ))}
      </div>

      <h3 className="module__h3">Troubleshooting</h3>
      <div className="faq">
        {TROUBLESHOOTING.map((f) => (
          <details key={f.q} className="lesson">
            <summary>{f.q}</summary>
            <div className="lesson__body prose">
              <p>{f.a}</p>
            </div>
          </details>
        ))}
      </div>

      <h3 className="module__h3">Keep learning</h3>
      <ul className="bullets">
        <li>
          <Link href="/skills">SMC Claude Skills Library</Link>: career skills you can add to Claude
          today.
        </li>
        <li>
          <Link href="/events">SMC events</Link>: upcoming workshops and talks.
        </li>
        <li>
          <a href={WORKSHOP.instructor.website} {...ext}>
            Prof. Boussioux’s website
          </a>
          : his research and teaching.
        </li>
      </ul>

      <div className="notice missing">
        <strong>Still to come on this page:</strong>
        <ul>
          {MISSING.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      </div>
    </Module>
  );
}

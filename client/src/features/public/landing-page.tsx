import { ArrowDownRight, ArrowRight, BookOpenCheck, Check, Compass, Leaf, Menu, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { ThemeToggle } from "@/components/shared/theme-toggle";

const pathways = [
  { label: "Discover", detail: "A clear place to begin", icon: Compass },
  { label: "Practice", detail: "Build understanding as you go", icon: Sparkles },
  { label: "Grow", detail: "See how far you have come", icon: Leaf },
];

export function LandingPage() {
  const [navigationOpen, setNavigationOpen] = useState(false);
  return (
    <div className="landing-page">
      <header className="landing-nav">
        <Link aria-label="LearnGate home" className="brand landing-brand" to="/">
          <span className="brand-mark"><BookOpenCheck aria-hidden="true" size={19} /></span>
          <span>Learn<span className="brand-accent">Gate</span></span>
        </Link>
        <div className="landing-nav-actions">
          <button aria-expanded={navigationOpen} aria-label={navigationOpen ? "Close navigation" : "Open navigation"} className="landing-nav-toggle" onClick={() => setNavigationOpen((open) => !open)} type="button">
            {navigationOpen ? <X size={18} /> : <Menu size={18} />}<span>Explore</span>
          </button>
          <ThemeToggle />
          <Link className="landing-login" to="/login">Sign in</Link>
          <Link className="landing-signup" to="/register">Get started <ArrowRight size={15} /></Link>
        </div>
      </header>
      {navigationOpen && (
        <>
          <button aria-label="Close navigation" className="landing-sidebar-backdrop" onClick={() => setNavigationOpen(false)} type="button" />
          <aside aria-label="Main navigation" className="landing-side-nav">
            <span className="eyebrow">EXPLORE LEARNGATE</span>
            <a href="#approach" onClick={() => setNavigationOpen(false)}>Our approach <ArrowRight size={15} /></a>
            <a href="#for-everyone" onClick={() => setNavigationOpen(false)}>For everyone <ArrowRight size={15} /></a>
            <Link to="/login" onClick={() => setNavigationOpen(false)}>Sign in <ArrowRight size={15} /></Link>
            <Link to="/register" onClick={() => setNavigationOpen(false)}>Create an account <ArrowRight size={15} /></Link>
          </aside>
        </>
      )}

      <main>
        <section aria-labelledby="landing-heading" className="landing-hero">
          <div className="landing-hero-copy">
            <span className="landing-kicker"><span /> A learning space made for people</span>
            <h1 id="landing-heading">Learning that<br />moves <em>you</em> forward.</h1>
            <p>
              Less getting lost. More getting somewhere. LearnGate brings
              lessons, practice, and progress into one welcoming place.
            </p>
            <div className="landing-hero-actions">
              <Link className="landing-cta" to="/register">Start learning <ArrowRight size={17} /></Link>
              <a className="landing-secondary" href="#approach">Take a look <ArrowDownRight size={16} /></a>
            </div>
            <div className="landing-trust-line"><span className="trust-check"><Check size={13} /></span> Built for students and the people who teach them</div>
          </div>

          <div aria-label="Illustration of a connected learning pathway" className="pathway-art" role="img">
            <div className="pathway-orbit orbit-large" />
            <div className="pathway-orbit orbit-small" />
            <div className="pathway-spark spark-one">✳</div>
            <div className="pathway-spark spark-two">✦</div>
            <div className="pathway-board">
              <div className="pathway-board-head">
                <span className="board-label">A PATH OF YOUR OWN</span>
                <span className="board-live"><span /> LEARNING IN MOTION</span>
              </div>
              <div className="pathway-board-title">Every next step<br />has a reason.</div>
              <div className="pathway-steps">
                {pathways.map(({ label, detail, icon: Icon }, index) => (
                  <div className={`pathway-step step-${index + 1}`} key={label}>
                    <span className="step-icon"><Icon size={17} /></span>
                    <span className="step-copy"><strong>{label}</strong><small>{detail}</small></span>
                    {index < pathways.length - 1 && <span className="step-connector" />}
                  </div>
                ))}
              </div>
              <div className="pathway-board-foot"><span>LEARN AT YOUR PACE</span><span className="board-foot-mark"><BookOpenCheck size={14} /> LearnGate</span></div>
            </div>
            <div className="art-note note-left"><span className="note-dot" /> One thing at a time</div>
            <div className="art-note note-right">A little progress adds up <span>↗</span></div>
          </div>
          <a aria-label="Scroll to our approach" className="hero-scroll" href="#approach"><span /> Scroll to explore</a>
        </section>

        <section className="landing-intro" id="approach">
          <div className="intro-label"><span>01</span> THE LEARNGATE APPROACH</div>
          <div className="intro-copy">
            <h2>Good learning isn’t a race.<br /><span>It’s a path you can follow.</span></h2>
            <p>Find your next lesson, build confidence through practice, and keep track of the work you have done. Clear steps for learners. A little more breathing room for educators.</p>
          </div>
        </section>

        <section aria-label="LearnGate benefits" className="landing-benefits" id="for-everyone">
          <article className="benefit-card">
            <span className="benefit-index">A / FOR LEARNERS</span>
            <span className="benefit-icon"><Compass size={20} /></span>
            <h3>Know what comes next.</h3>
            <p>Lessons follow a thoughtful sequence, so your next step feels clear—and earned.</p>
            <Link to="/register">Find your footing <ArrowRight size={15} /></Link>
          </article>
          <article className="benefit-card benefit-card-featured">
            <span className="benefit-index">B / FOR EDUCATORS</span>
            <span className="benefit-icon"><BookOpenCheck size={20} /></span>
            <h3>Make space for teaching.</h3>
            <p>Bring subjects, materials, and student progress together without the busywork.</p>
            <Link to="/register">Build your classroom <ArrowRight size={15} /></Link>
          </article>
          <article className="benefit-card">
            <span className="benefit-index">C / MADE TOGETHER</span>
            <span className="benefit-icon"><Leaf size={20} /></span>
            <h3>Progress worth noticing.</h3>
            <p>Keep learning personal, accessible, and focused on how far you have come.</p>
            <Link to="/register">Grow with LearnGate <ArrowRight size={15} /></Link>
          </article>
        </section>

        <section className="landing-final-cta">
          <div><span className="landing-kicker"><span /> YOUR NEXT CHAPTER STARTS HERE</span><h2>Ready for a better<br />way to learn?</h2></div>
          <Link className="landing-cta" to="/register">Create your account <ArrowRight size={17} /></Link>
        </section>
      </main>

      <footer className="landing-footer">
        <Link className="brand landing-brand" to="/"><span className="brand-mark"><BookOpenCheck size={17} /></span><span>Learn<span className="brand-accent">Gate</span></span></Link>
        <span>Room to learn. Space to grow.</span>
        <div><Link to="/login">Sign in</Link><Link to="/register">Create account</Link></div>
      </footer>
    </div>
  );
}

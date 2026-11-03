import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, BookOpenCheck, BrainCircuit, Check, ChevronLeft, ChevronRight, FileUp, LoaderCircle, Pencil, Plus, RotateCcw, Save, Sparkles, Trash2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { api, getApiError } from "@/services/api";

type Flashcard = {
  _id?: string;
  front: string;
  back: string;
  sourceReference: { kind: "slide"; number: number };
};

type FlashcardDeck = {
  _id: string;
  title: string;
  fileName: string;
  fileType: "ppt" | "pptx";
  status: "queued" | "extracting" | "generating" | "ready" | "failed";
  progress: number;
  message: string;
  errorMessage: string | null;
  requestedCardCount: number;
  cards: Flashcard[];
  createdAt: string;
};

type DeckListItem = Omit<FlashcardDeck, "cards"> & { cardCount: number };
type DeckListResponse = { data: { decks: DeckListItem[]; quota: { used: number; limit: number; remaining: number } } };
type DeckResponse = { data: FlashcardDeck };
const activeStatuses = ["queued", "extracting", "generating"];

export function FlashcardsPage() {
  const { deckId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [titleInput, setTitleInput] = useState("");
  const [cardCount, setCardCount] = useState(10);
  const [editedTitle, setEditedTitle] = useState("");
  const [editedCards, setEditedCards] = useState<Flashcard[]>([]);
  const [flipped, setFlipped] = useState(false);
  const [studyIndex, setStudyIndex] = useState(0);
  const [masteredCards, setMasteredCards] = useState<Set<number>>(() => new Set());
  const [mode, setMode] = useState<"study" | "edit">("study");

  const decksQuery = useQuery({
    queryKey: ["flashcard-decks"],
    queryFn: async () => (await api.get<DeckListResponse>("/flashcards")).data.data,
    refetchInterval: (query) => query.state.data?.decks.some((item) => activeStatuses.includes(item.status)) ? 2500 : false,
  });
  const deckQuery = useQuery({
    queryKey: ["flashcard-deck", deckId],
    queryFn: async () => (await api.get<DeckResponse>(`/flashcards/${deckId}`)).data.data,
    enabled: Boolean(deckId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && activeStatuses.includes(status) ? 1500 : false;
    },
  });
  const deck = deckQuery.data;
  const cards = mode === "edit" ? editedCards : deck?.cards ?? [];
  const currentCard = cards[studyIndex];
  const readyDecks = useMemo(() => decksQuery.data?.decks ?? [], [decksQuery.data]);

  useEffect(() => {
    if (deck?.status !== "ready") return;
    setEditedTitle(deck.title);
    setEditedCards(deck.cards.map(({ front, back, sourceReference }) => ({ front, back, sourceReference })));
    setStudyIndex(0);
    setFlipped(false);
    setMasteredCards(new Set());
    setMode("study");
  }, [deck?._id, deck?.status]);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Choose a PowerPoint presentation first.");
      const body = new FormData();
      body.append("file", file);
      body.append("cardCount", String(cardCount));
      if (titleInput.trim()) body.append("title", titleInput.trim());
      const { data } = await api.post<{ data: { deckId: string } }>("/flashcards", body, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return data.data.deckId;
    },
    onSuccess: async (createdDeckId) => {
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setTitleInput("");
      await queryClient.invalidateQueries({ queryKey: ["flashcard-decks"] });
      navigate(`/flashcards/${createdDeckId}`);
    },
  });
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!deckId) throw new Error("Select a flashcard deck to save.");
      await api.put(`/flashcards/${deckId}`, { title: editedTitle, cards: editedCards });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["flashcard-deck", deckId] }),
        queryClient.invalidateQueries({ queryKey: ["flashcard-decks"] }),
      ]);
      setMode("study");
    },
  });
  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!deckId) return;
      await api.delete(`/flashcards/${deckId}`);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["flashcard-decks"] });
      navigate("/flashcards");
    },
  });

  function moveStudy(index: number) {
    const boundedIndex = Math.max(0, Math.min(index, cards.length - 1));
    setStudyIndex(boundedIndex);
    setFlipped(false);
  }

  function updateCard(index: number, field: "front" | "back", value: string) {
    setEditedCards((previous) => previous.map((card, cardIndex) => (
      cardIndex === index ? { ...card, [field]: value } : card
    )));
  }

  function appendCard() {
    const sourceReference = editedCards[editedCards.length - 1]?.sourceReference
      ?? { kind: "slide" as const, number: 1 };
    setEditedCards((previous) => [...previous, { front: "", back: "", sourceReference }]);
  }

  function removeCard(index: number) {
    setEditedCards((previous) => previous.filter((_, cardIndex) => cardIndex !== index));
  }

  function markKnown() {
    setMasteredCards((previous) => new Set(previous).add(studyIndex));
    if (studyIndex < cards.length - 1) moveStudy(studyIndex + 1);
    else setFlipped(false);
  }

  return (
    <section className="flashcards-page">
      <header className="flashcards-heading">
        <div>
          <span className="eyebrow">STUDY TOOLS</span>
          <h1>Study flashcards</h1>
          <p>Turn presentation slides into a study set, then practice at your own pace.</p>
        </div>
        <div className="flashcards-quota">
          <Sparkles aria-hidden="true" size={16} />
          {decksQuery.data
            ? `${decksQuery.data.quota.remaining} of ${decksQuery.data.quota.limit} AI generations left this month`
            : "AI study tools"}
        </div>
      </header>

      <div className="flashcards-layout">
        <aside className="flashcards-collection" aria-label="Flashcard decks">
          <div className="flashcards-collection-title">
            <h2>Your decks</h2><span>{readyDecks.length}</span>
          </div>
          {decksQuery.isLoading && <p className="flashcards-muted">Loading decks…</p>}
          {decksQuery.isError && <p className="form-message form-error" role="alert">{getApiError(decksQuery.error)}</p>}
          {!decksQuery.isLoading && readyDecks.length === 0 && (
            <p className="flashcards-muted">Your saved study sets will appear here.</p>
          )}
          <div className="flashcard-deck-list">
            {readyDecks.map((item) => (
              <button
                aria-current={deckId === item._id ? "page" : undefined}
                className={`flashcard-deck-item ${deckId === item._id ? "selected" : ""}`}
                key={item._id}
                onClick={() => navigate(`/flashcards/${item._id}`)}
                type="button"
              >
                <span className="flashcard-deck-icon"><BrainCircuit aria-hidden="true" size={18} /></span>
                <span className="flashcard-deck-copy">
                  <strong>{item.title}</strong>
                  <small>{item.status === "ready" ? `${item.cardCount} cards` : item.message}</small>
                </span>
                {activeStatuses.includes(item.status) && <LoaderCircle aria-label="Generating" className="spin" size={16} />}
              </button>
            ))}
          </div>
          {readyDecks.filter((item) => item.status === "failed").map((item) => (
            <div className="flashcard-generation-error" key={item._id}>
              <strong>{item.title}</strong><span>{item.errorMessage ?? "Generation failed."}</span>
            </div>
          ))}
        </aside>

        <div className="flashcards-main">
          {!deckId && (
            <section className="flashcard-upload-panel">
              <div className="flashcard-upload-art"><FileUp aria-hidden="true" size={25} /></div>
              <span className="eyebrow">FROM SLIDES TO STUDY SET</span>
              <h2>Bring your PowerPoint to life.</h2>
              <p>Upload a .ppt or .pptx file. LearnGate creates slide-cited cards you can edit and study.</p>
              {createMutation.isError && <div className="form-message form-error" role="alert">{getApiError(createMutation.error)}</div>}
              <form className="flashcard-upload-form" onSubmit={(event) => { event.preventDefault(); createMutation.mutate(); }}>
                <label className="flashcard-file-field">
                  <span>PowerPoint presentation</span>
                  <input accept=".ppt,.pptx,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation" onChange={(event) => setFile(event.target.files?.[0] ?? null)} ref={fileInputRef} required type="file" />
                  <small>{file ? file.name : "PowerPoint 97–2003 or Open XML presentation"}</small>
                </label>
                <label>
                  <span>Deck name <small>Optional</small></span>
                  <input maxLength={120} onChange={(event) => setTitleInput(event.target.value)} placeholder="e.g. Cell biology review" value={titleInput} />
                </label>
                <label>
                  <span>Number of cards</span>
                  <select onChange={(event) => setCardCount(Number(event.target.value))} value={cardCount}>
                    {[5, 10, 15, 20, 25, 30].map((count) => <option key={count} value={count}>{count} cards</option>)}
                  </select>
                </label>
                <button className="primary-button flashcard-create-button" disabled={createMutation.isPending || !file} type="submit">
                  {createMutation.isPending ? <><LoaderCircle className="spin" size={17} /> Uploading…</> : <><Sparkles size={17} /> Create study set</>}
                </button>
              </form>
              <p className="flashcard-privacy-note">Extracted slide text is sent to your configured AI provider to make the cards. The uploaded file itself is not retained.</p>
            </section>
          )}

          {deckId && deckQuery.isLoading && <div className="flashcard-state-card" role="status"><LoaderCircle className="spin" /> Loading your study set…</div>}
          {deckId && deckQuery.isError && <div className="form-message form-error" role="alert">{getApiError(deckQuery.error)}</div>}
          {deck && activeStatuses.includes(deck.status) && (
            <section className="flashcard-state-card" aria-live="polite">
              <span className="flashcard-processing-icon"><LoaderCircle className="spin" size={24} /></span>
              <span className="eyebrow">BUILDING YOUR STUDY SET</span>
              <h2>{deck.title}</h2><p>{deck.message}</p>
              <div className="flashcard-progress"><span style={{ width: `${deck.progress}%` }} /></div>
              <small>{deck.progress}%</small>
            </section>
          )}
          {deck?.status === "failed" && (
            <section className="flashcard-state-card">
              <span className="eyebrow">GENERATION FAILED</span>
              <h2>We couldn’t make that study set.</h2>
              <p role="alert">{deck.errorMessage ?? deck.message}</p>
              <button className="secondary-button" onClick={() => navigate("/flashcards")} type="button"><ArrowLeft size={16} /> Back to flashcards</button>
            </section>
          )}

          {deck?.status === "ready" && mode === "study" && (
            <section className="flashcard-study-panel">
              <div className="flashcard-deck-header">
                <div><span className="eyebrow">{deck.fileName}</span><h2>{deck.title}</h2></div>
                <div className="flashcard-deck-actions">
                  <button className="secondary-button" onClick={() => setMode("edit")} type="button"><Pencil size={15} /> Edit cards</button>
                  <button aria-label="Delete deck" className="icon-button flashcard-delete" disabled={deleteMutation.isPending} onClick={() => {
                    if (window.confirm(`Delete “${deck.title}” and its cards?`)) deleteMutation.mutate();
                  }} title="Delete deck" type="button"><Trash2 size={17} /></button>
                </div>
              </div>
              {deleteMutation.isError && <p className="form-message form-error" role="alert">{getApiError(deleteMutation.error)}</p>}
              {cards.length > 0 && currentCard ? (
                <>
                  <div className="flashcard-study-meta">
                    <span>Card {studyIndex + 1} of {cards.length}</span>
                    <span><Check size={14} /> {masteredCards.size} known this session</span>
                  </div>
                  <button
                    aria-label={flipped ? "Show question side" : "Flip card to show answer"}
                    aria-live="polite"
                    className={`flashcard-study-card ${flipped ? "is-flipped" : ""}`}
                    onClick={() => setFlipped((value) => !value)}
                    type="button"
                  >
                    <span className="flashcard-face-label">{flipped ? "ANSWER" : "QUESTION"}</span>
                    <span className="flashcard-face-text">{flipped ? currentCard.back : currentCard.front}</span>
                    <span className="flashcard-source">Slide {currentCard.sourceReference.number} <span>·</span> Click to flip</span>
                    <RotateCcw aria-hidden="true" className="flashcard-flip-icon" size={17} />
                  </button>
                  <div className="flashcard-study-controls">
                    <button aria-label="Previous card" className="icon-button" disabled={studyIndex === 0} onClick={() => moveStudy(studyIndex - 1)} type="button"><ChevronLeft size={20} /></button>
                    <button className="secondary-button" disabled={!flipped} onClick={() => moveStudy((studyIndex + 1) % cards.length)} type="button">Practice again</button>
                    <button className="primary-button" disabled={!flipped} onClick={markKnown} type="button"><Check size={16} /> Got it</button>
                    <button aria-label="Next card" className="icon-button" disabled={studyIndex === cards.length - 1} onClick={() => moveStudy(studyIndex + 1)} type="button"><ChevronRight size={20} /></button>
                  </div>
                  <div aria-label="Study progress" className="flashcard-study-progress"><span style={{ width: `${((studyIndex + 1) / cards.length) * 100}%` }} /></div>
                  <button className="flashcard-all-cards-link" onClick={() => setMode("edit")} type="button">Review all cards <ArrowRight size={14} /></button>
                </>
              ) : (
                <div className="flashcard-state-card">
                  <h3>No cards in this deck</h3>
                  <p>Add at least one card before studying.</p>
                  <button className="primary-button" onClick={() => setMode("edit")} type="button">Add cards</button>
                </div>
              )}
            </section>
          )}

          {deck?.status === "ready" && mode === "edit" && (
            <section className="flashcard-editor">
              <div className="flashcard-editor-heading">
                <button className="flashcard-back-link" onClick={() => setMode("study")} type="button"><ArrowLeft size={15} /> Back to study</button>
                <div><span className="eyebrow">REVIEW AND EDIT</span><h2>Make this set yours.</h2></div>
              </div>
              {saveMutation.isError && <div className="form-message form-error" role="alert">{getApiError(saveMutation.error)}</div>}
              <label className="flashcard-title-edit"><span>Deck name</span><input maxLength={120} onChange={(event) => setEditedTitle(event.target.value)} value={editedTitle} /></label>
              <div className="flashcard-editor-list">
                {editedCards.map((card, index) => (
                  <article className="flashcard-editor-item" key={card._id ?? index}>
                    <div className="flashcard-editor-item-head">
                      <strong>Card {index + 1}</strong>
                      <span>Slide {card.sourceReference.number}</span>
                      <button aria-label={`Remove card ${index + 1}`} className="icon-button flashcard-delete" disabled={editedCards.length <= 1} onClick={() => removeCard(index)} type="button"><Trash2 size={16} /></button>
                    </div>
                    <label><span>Question</span><textarea maxLength={500} onChange={(event) => updateCard(index, "front", event.target.value)} required rows={2} value={card.front} /></label>
                    <label><span>Answer</span><textarea maxLength={2000} onChange={(event) => updateCard(index, "back", event.target.value)} required rows={3} value={card.back} /></label>
                  </article>
                ))}
              </div>
              <div className="flashcard-editor-actions">
                <button className="secondary-button" disabled={editedCards.length >= 30} onClick={appendCard} type="button"><Plus size={16} /> Add card</button>
                <button className="primary-button" disabled={saveMutation.isPending || !editedTitle.trim() || editedCards.some((card) => card.front.trim().length < 3 || !card.back.trim())} onClick={() => saveMutation.mutate()} type="button">
                  {saveMutation.isPending ? <><LoaderCircle className="spin" size={16} /> Saving…</> : <><Save size={16} /> Save changes</>}
                </button>
              </div>
            </section>
          )}

          {deckId && deck?.status === "ready" && (
            <button className="flashcard-another-link" onClick={() => navigate("/flashcards")} type="button"><BookOpenCheck size={16} /> Create another study set</button>
          )}
        </div>
      </div>
    </section>
  );
}

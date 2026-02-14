

(function () {

  const API = "https://damp-wind-8900.darshgb.workers.dev";

  new Vue({
    el: "#app",
    data: {
      turnstileWidgetId: null,
      turnstileReady: false,
      site: {
        title: "My Works",
        subtitle: "Stories, novels, and everything I’m creating.",
        author: "Darshan Goburdhone"
      },
      books: [],
      _apiSummary: {},
      comments: [],
      query: "",
      genreFilter: "",
      activeBook: null,
      modalLoading: false,

      // Draft UI
      myDraftRating: 0,
      commentDraft: { name: "", email: "", text: "" }
    },
    computed: {
      genres: function () {
        const set = new Set(this.books.map(b => b.genre).filter(Boolean));
        return Array.from(set).sort((a, b) => a.localeCompare(b));
      },
      filteredBooks: function () {
        const q = (this.query || "").trim().toLowerCase();
        const gf = (this.genreFilter || "").trim().toLowerCase();

        let list = this.books.filter(b => {
            const matchesGenre = !gf || (b.genre || "").toLowerCase() === gf;
            if (!q) return matchesGenre;

            const hay = [
            b.title, b.genre, b.status, b.blurb,
            (b.tags || []).join(" ")
            ].join(" ").toLowerCase();

            return matchesGenre && hay.includes(q);
        });

        // Sort
        return list.sort((a, b) =>
            a.title.localeCompare(b.title, undefined, { sensitivity: "base" })
        );
      }
    },
    methods: {
      async init() {
        const res = await fetch("./books.json", { cache: "no-store" });
        this.books = await res.json();
        
        await this.loadAllSummaries(); // loads rating counts for homepage cards
        this.$forceUpdate();
      },

      async loadAllSummaries() {
  this._apiSummary = this._apiSummary || {};

      await Promise.all(
        this.books.map(async (b) => {
          try {
            const res = await fetch(`${API}/api/books/${b.id}/summary?t=${Date.now()}`, { cache: "no-store" });
            const data = await res.json();
            this.$set(this._apiSummary, b.id, data); // important for Vue 2 reactivity
          } catch (e) {
            // ignore per-book errors
          }
        })
      );
    },
      
      renderTurnstile() {
        // wait until Turnstile script is loaded
        if (!window.turnstile) return;
      
        const el = document.getElementById("turnstile-box");
        if (!el) return;
      
        // clear old content if any
        el.innerHTML = "";
      
        this.turnstileWidgetId = window.turnstile.render("#turnstile-box", {
          sitekey: "0x4AAAAAACa_NwyPixSSIVcn",
          callback: () => { this.turnstileReady = true; },
          "expired-callback": () => { this.turnstileReady = false; },
          "error-callback": () => { this.turnstileReady = false; }
        });
      
        this.turnstileReady = false;
      },

    

      async refreshSummary(bookId) {
        const res = await fetch(`${API}/api/books/${bookId}/summary?t=${Date.now()}`, { cache: "no-store" });
        const data = await res.json();

        //this._apiSummary = this._apiSummary || {};
        this.$set(this._apiSummary, bookId, data);
        },

      async loadComments(bookId) {
        const res = await fetch(`${API}/api/books/${bookId}/comments`);
        const data = await res.json();

        this.comments = data.comments || [];
        },

      coverStyle(b) {
        if (b.cover) return { backgroundImage: `url(${b.cover})` };
        // fallback gradient
        return { backgroundImage: "linear-gradient(135deg, rgba(255,255,255,0.10), rgba(255,255,255,0.02))" };
      },

      async openBook(b) {
        this.activeBook = b;
        this.modalLoading = true;
        document.body.style.overflow = "hidden";
        await this.refreshSummary(b.id);
        await this.loadComments(b.id);

        this.modalLoading = false;
        
        this.$nextTick(() => {
          this.renderTurnstile();
        });
      },


      closeBook() {
        this.activeBook = null;
        this.myDraftRating = 0;
        document.body.style.overflow = "";
      },

      // ---------- Ratings ----------
      avgRating(bookId) {
        if (!this._apiSummary || !this._apiSummary[bookId]) return 0;
        return this._apiSummary[bookId].avg || 0;
        },

      ratingCount(bookId) {
        if (!this._apiSummary || !this._apiSummary[bookId]) return 0;
        return this._apiSummary[bookId].count || 0;
        },

      setDraftRating(n) {
        this.myDraftRating = n;
      },
      async submitRating() {
        if (!this.activeBook || !this.myDraftRating) return;

        const res = await fetch(`${API}/api/books/${this.activeBook.id}/rate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ stars: this.myDraftRating })
        });

        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            alert(data.error || "Failed to submit rating");
            return;
        }

        await this.refreshSummary(this.activeBook.id);
        await this.loadAllSummaries();
        },

      // ---------- Comments----------
      commentsFor() {
        return this.comments || [];
        },
      async submitComment() {
        if (!this.activeBook) return;

        const token = window.turnstile.getResponse(this.turnstileWidgetId);
        if (!token) {
            alert("Please verify you are human");
            return;
        }

        const res = await fetch(`${API}/api/books/${this.activeBook.id}/comment`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
            ...this.commentDraft,
            turnstileToken: token
            })
        });

        const data = await res.json();

        if (data.ok) {
            alert("Comment submitted for approval!");
            this.commentDraft = { name: "", email: "", text: "" };
        }

        
        window.turnstile.reset(this.turnstileWidgetId);
        await this.loadComments(this.activeBook.id);
        },


      formatDate(ts) {
        try {
          const d = new Date(ts);
          return d.toLocaleString(undefined, { year: "numeric", month: "short", day: "2-digit" });
        } catch {
          return "";
        }
      },
    },
    mounted() {
      this.init();
      window.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && this.activeBook) this.closeBook();
      });
    }
  });

  function cryptoRandomId() {
    
    if (window.crypto && crypto.getRandomValues) {
      const a = new Uint32Array(4);
      crypto.getRandomValues(a);
      return Array.from(a).map(x => x.toString(16).padStart(8, "0")).join("");
    }
    return String(Date.now()) + Math.random().toString(16).slice(2);
  }
})();











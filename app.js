(function () {
  const API = "https://damp-wind-8900.darshgb.workers.dev";

  new Vue({
    el: "#app",
    data: {
      // ✅ MUST be in data for Vue 2 reactivity
      _apiSummary: {},

      // Turnstile
      turnstileWidgetId: null,
      turnstileReady: false,

      site: {
        title: "Time Empire",
        subtitle: "Stories, novels, and everything I’m building.",
        author: "Darshan Goburdhone",
      },

      books: [],
      comments: [],
      query: "",
      genreFilter: "",
      activeBook: null,

      myDraftRating: 0,
      commentDraft: { name: "", email: "", text: "" },
    },

    computed: {
      genres: function () {
        const set = new Set(this.books.map((b) => b.genre).filter(Boolean));
        return Array.from(set).sort((a, b) => a.localeCompare(b));
      },

      filteredBooks: function () {
        const q = (this.query || "").trim().toLowerCase();
        const gf = (this.genreFilter || "").trim().toLowerCase();

        let list = this.books.filter((b) => {
          const matchesGenre = !gf || (b.genre || "").toLowerCase() === gf;
          if (!q) return matchesGenre;

          const hay = [b.title, b.genre, b.status, b.blurb, (b.tags || []).join(" ")]
            .join(" ")
            .toLowerCase();

          return matchesGenre && hay.includes(q);
        });

        // sort by title
        return list.sort((a, b) =>
          a.title.localeCompare(b.title, undefined, { sensitivity: "base" })
        );
      },
    },

    methods: {
      // ------------- INIT -------------
      async init() {
        const res = await fetch("./books.json", { cache: "no-store" });
        this.books = await res.json();
        await this.loadAllSummaries(); // load card summaries once
      },

      // ------------- SUMMARIES -------------
      async fetchSummary(bookId) {
        // ✅ cache-buster guarantees fresh values
        const url = `${API}/api/books/${bookId}/summary?t=${Date.now()}`;
        const res = await fetch(url, { cache: "no-store" });
        const data = await res.json();

        // Normalize numbers (just in case)
        const normalized = {
          bookId: data.bookId || bookId,
          count: Number(data.count || 0),
          avg: Number(data.avg || 0),
        };

        this.$set(this._apiSummary, bookId, normalized);
      },

      async loadAllSummaries() {
        // Load summaries for all books (for homepage cards)
        await Promise.all(
          this.books.map(async (b) => {
            try {
              await this.fetchSummary(b.id);
            } catch (e) {
              // Ignore per-book failure
            }
          })
        );
      },

      async refreshSummary(bookId) {
        await this.fetchSummary(bookId);
      },

      // ------------- TURNSTILE (COMMENTS ONLY) -------------
      renderTurnstile() {
        if (!window.turnstile) return;

        const el = document.getElementById("turnstile-box");
        if (!el) return;

        el.innerHTML = "";

        this.turnstileWidgetId = window.turnstile.render("#turnstile-box", {
          sitekey: "0x4AAAAAACa_NwyPixSSIVcn",
          callback: () => {
            this.turnstileReady = true;
          },
          "expired-callback": () => {
            this.turnstileReady = false;
          },
          "error-callback": () => {
            this.turnstileReady = false;
          },
        });

        this.turnstileReady = false;
      },

      // ------------- COMMENTS -------------
      async loadComments(bookId) {
        const res = await fetch(`${API}/api/books/${bookId}/comments?t=${Date.now()}`, {
          cache: "no-store",
        });
        const data = await res.json();
        this.comments = data.comments || [];
      },

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
            turnstileToken: token,
          }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          alert(data.error || "Failed to submit comment");
          return;
        }

        alert("Comment submitted for approval ❤️");
        this.commentDraft = { name: "", email: "", text: "" };

        window.turnstile.reset(this.turnstileWidgetId);
        await this.loadComments(this.activeBook.id);
      },

      // ------------- UI HELPERS -------------
      coverStyle(b) {
        if (b.cover) return { backgroundImage: `url(${b.cover})` };
        return {
          backgroundImage:
            "linear-gradient(135deg, rgba(255,255,255,0.10), rgba(255,255,255,0.02))",
        };
      },

      async openBook(b) {
        this.activeBook = b;
        document.body.style.overflow = "hidden";

        await this.refreshSummary(b.id);
        await this.loadComments(b.id);

        this.$nextTick(() => {
          this.renderTurnstile();
        });
      },

      closeBook() {
        this.activeBook = null;
        this.myDraftRating = 0;
        document.body.style.overflow = "";
      },

      formatDate(ts) {
        try {
          const d = new Date(ts);
          return d.toLocaleString(undefined, {
            year: "numeric",
            month: "short",
            day: "2-digit",
          });
        } catch {
          return "";
        }
      },

      // ------------- RATINGS -------------
      avgRating(bookId) {
        const s = this._apiSummary[bookId];
        return s ? Number(s.avg || 0) : 0;
      },

      ratingCount(bookId) {
        const s = this._apiSummary[bookId];
        return s ? Number(s.count || 0) : 0;
      },

      setDraftRating(n) {
        this.myDraftRating = n;
      },

      async submitRating() {
        if (!this.activeBook || !this.myDraftRating) return;

        const res = await fetch(`${API}/api/books/${this.activeBook.id}/rate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stars: this.myDraftRating }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          alert(data.error || "Failed to submit rating");
          return;
        }

        // ✅ Only refresh THIS book — updates modal + homepage card automatically
        await this.refreshSummary(this.activeBook.id);

        // Optional: reset your draft rating after submit
        this.myDraftRating = 0;
      },
    },

    mounted() {
      this.init();
      window.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && this.activeBook) this.closeBook();
      });
    },
  });
})();

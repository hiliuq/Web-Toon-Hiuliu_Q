/* ============================================================
   HILIU_Q READER HUB
   APP.JS
   ============================================================ */

(() => {
    "use strict";

    /* ========================================================
       CONFIG
       ======================================================== */

    const CONFIG = {
        brand: "HILIU_Q",
        telegram: "https://t.me/hiliu_q",

        /*
         * Khi có backend realtime:
         *
         * window.HILIU_CONFIG = {
         *     SIGNAL_URL: "wss://your-server.example/ws"
         * };
         */
        signalUrl:
            window.HILIU_CONFIG?.SIGNAL_URL || "",

        storagePrefix:
            "hiliu_reader_hub_",

        animationDuration: 280
    };


    /* ========================================================
       HELPERS
       ======================================================== */

    const $ = (selector, parent = document) =>
        parent.querySelector(selector);

    const $$ = (selector, parent = document) =>
        [...parent.querySelectorAll(selector)];

    const sleep = (ms) =>
        new Promise(resolve => setTimeout(resolve, ms));


    const safeJsonParse = (value, fallback = null) => {
        try {
            return JSON.parse(value);
        } catch {
            return fallback;
        }
    };


    const storage = {
        get(key, fallback = null) {
            const value = localStorage.getItem(
                CONFIG.storagePrefix + key
            );

            return value === null
                ? fallback
                : safeJsonParse(value, fallback);
        },

        set(key, value) {
            localStorage.setItem(
                CONFIG.storagePrefix + key,
                JSON.stringify(value)
            );
        },

        remove(key) {
            localStorage.removeItem(
                CONFIG.storagePrefix + key
            );
        }
    };


    const escapeHtml = (value) => {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    };


    const formatFileSize = (bytes) => {
        if (!Number.isFinite(bytes)) {
            return "0 B";
        }

        const units = [
            "B",
            "KB",
            "MB",
            "GB",
            "TB"
        ];

        let size = bytes;
        let index = 0;

        while (
            size >= 1024 &&
            index < units.length - 1
        ) {
            size /= 1024;
            index++;
        }

        return `${size.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
    };


    const randomId = (length = 8) => {
        const chars =
            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

        let result = "";

        for (let i = 0; i < length; i++) {
            result += chars[
                Math.floor(Math.random() * chars.length)
            ];
        }

        return result;
    };


    const randomPairCode = () => {
        const number =
            Math.floor(100000 + Math.random() * 900000);

        return String(number);
    };


    const isValidUrl = (value) => {
        try {
            const url = new URL(value);

            return (
                url.protocol === "http:" ||
                url.protocol === "https:"
            );
        } catch {
            return false;
        }
    };


    const getFileIcon = (file) => {
        const type = file.type || "";

        if (type.startsWith("image/")) {
            return "image";
        }

        if (type.startsWith("video/")) {
            return "video";
        }

        if (type.startsWith("audio/")) {
            return "music";
        }

        if (type.includes("pdf")) {
            return "file-text";
        }

        if (
            type.includes("zip") ||
            type.includes("rar") ||
            type.includes("7z")
        ) {
            return "archive";
        }

        return "file";
    };


    const refreshIcons = () => {
        if (window.lucide) {
            window.lucide.createIcons();
        }
    };


    /* ========================================================
       APP STATE
       ======================================================== */

    const state = {

        currentRoute:
            location.hash.replace("#", "") || "home",

        currentChatId: null,

        pairCode:
            storage.get("pairCode", null),

        selectedDeviceId:
            null,

        announcementVisible:
            storage.get("announcementVisible", true),

        rooms:
            storage.get("watchRooms", []),

        messages:
            storage.get("messages", {}),

        comics:
            storage.get("comics", []),

        devices:
            storage.get("devices", []),

        notifications:
            storage.get("notifications", []),

        transferQueue:
            [],

        localMediaStream:
            null,

        mediaType:
            null,

        mediaMuted:
            false,

        socket:
            null,

        reconnectTimer:
            null,

        isAdmin:
            storage.get("isAdmin", false),

        peerConnections:
            new Map(),

        pendingCandidates:
            new Map()

    };


    /* ========================================================
       DEFAULT DATA
       ======================================================== */

    const defaultComics = [
        {
            id: "demo-001",
            title: "HILIU_Q Library",
            category: "manhwa",
            chapters: 12,
            author: "HILIU_Q",
            description:
                "Khu vực truyện mẫu — thay bằng dữ liệu thật từ Admin.",
            cover: ""
        },
        {
            id: "demo-002",
            title: "Reader Community",
            category: "manga",
            chapters: 8,
            author: "Member",
            description:
                "Truyện cộng đồng được đăng trong Reader Hub.",
            cover: ""
        },
        {
            id: "demo-003",
            title: "Moonlight Archive",
            category: "webtoon",
            chapters: 15,
            author: "HILIU_Q",
            description:
                "Một bộ truyện mẫu cho giao diện kho truyện.",
            cover: ""
        },
        {
            id: "demo-004",
            title: "Cosmic Reader",
            category: "comic",
            chapters: 21,
            author: "Member",
            description:
                "Không gian truyện dành cho cộng đồng.",
            cover: ""
        }
    ];


    const defaultNotifications = [
        {
            id: randomId(),
            title: "Chào mừng đến HILIU_Q",
            text:
                "Reader Hub đã sẵn sàng.",
            icon: "sparkles",
            time: Date.now()
        }
    ];


    const ensureDefaults = () => {

        if (!Array.isArray(state.comics) || !state.comics.length) {
            state.comics = defaultComics;

            storage.set(
                "comics",
                state.comics
            );
        }

        if (
            !Array.isArray(state.notifications) ||
            !state.notifications.length
        ) {
            state.notifications =
                defaultNotifications;

            storage.set(
                "notifications",
                state.notifications
            );
        }
    };


    ensureDefaults();


    /* ========================================================
       TOAST
       ======================================================== */

    const showToast = (
        message,
        type = "success",
        duration = 2600
    ) => {

        const container =
            $("#toastContainer");

        if (!container) return;

        const toast =
            document.createElement("div");

        const icon =
            type === "error"
                ? "alert-circle"
                : type === "info"
                    ? "info"
                    : "check-circle-2";

        toast.className =
            `toast ${type}`;

        toast.innerHTML = `
            <i data-lucide="${icon}"></i>
            <span>${escapeHtml(message)}</span>
        `;

        container.appendChild(toast);

        refreshIcons();

        window.setTimeout(() => {

            toast.style.opacity = "0";
            toast.style.transform =
                "translateY(8px) scale(.97)";

            window.setTimeout(() => {
                toast.remove();
            }, 250);

        }, duration);
    };


    /* ========================================================
       MODALS
       ======================================================== */

    const openModal = (id) => {

        const modal = document.getElementById(id);

        if (!modal) return;

        modal.classList.add("open");
        modal.setAttribute(
            "aria-hidden",
            "false"
        );

        document.body.classList.add(
            "modal-open"
        );

        refreshIcons();
    };


    const closeModal = (id) => {

        const modal = document.getElementById(id);

        if (!modal) return;

        modal.classList.remove("open");

        modal.setAttribute(
            "aria-hidden",
            "true"
        );

        if (!$(".modal.open")) {
            document.body.classList.remove(
                "modal-open"
            );
        }
    };


    const closeAllModals = () => {

        $$(".modal.open").forEach(modal => {

            modal.classList.remove("open");

            modal.setAttribute(
                "aria-hidden",
                "true"
            );

        });

        document.body.classList.remove(
            "modal-open"
        );
    };


    /* ========================================================
       ROUTING / SPA
       ======================================================== */

    const normalizeRoute = (route) => {

        const allowed = [
            "home",
            "read",
            "watch",
            "connect",
            "messenger",
            "donate",
            "request",
            "bypass",
            "admin"
        ];

        return allowed.includes(route)
            ? route
            : "home";
    };


    const navigate = (route) => {

        route = normalizeRoute(route);

        state.currentRoute = route;

        if (
            location.hash !== `#${route}`
        ) {
            history.pushState(
                null,
                "",
                `#${route}`
            );
        }

        renderRoute(route);

        closeMobileSidebar();
        closeAllModals();

        window.scrollTo({
            top: 0,
            behavior: "smooth"
        });
    };


    const renderRoute = (route) => {

        route = normalizeRoute(route);

        $$(".page-section").forEach(section => {

            const isActive =
                section.dataset.page === route;

            section.classList.toggle(
                "active-page",
                isActive
            );

        });


        $$("[data-route]").forEach(link => {

            const target =
                link.dataset.route;

            link.classList.toggle(
                "active",
                target === route
            );

        });


        /*
         * Admin không nên xuất hiện như một route
         * public nếu tài khoản hiện tại không phải Admin.
         */
        if (
            route === "admin" &&
            !state.isAdmin
        ) {

            showToast(
                "Khu vực này dành cho Admin.",
                "error"
            );

            navigate("home");

            return;
        }

        refreshIcons();
    };


    const handleHashChange = () => {

        const route =
            location.hash.replace("#", "") ||
            "home";

        renderRoute(route);

    };


    /* ========================================================
       MOBILE MENU
       ======================================================== */

    const openMobileSidebar = () => {

        const sidebar =
            $("#mobileSidebar");

        if (!sidebar) return;

        sidebar.classList.add("open");

        sidebar.setAttribute(
            "aria-hidden",
            "false"
        );
    };


    const closeMobileSidebar = () => {

        const sidebar =
            $("#mobileSidebar");

        if (!sidebar) return;

        sidebar.classList.remove("open");

        sidebar.setAttribute(
            "aria-hidden",
            "true"
        );
    };


    /* ========================================================
       ANNOUNCEMENT
       ======================================================== */

    const initAnnouncement = () => {

        const section =
            $("#announcementSection");

        if (!section) return;

        if (
            state.announcementVisible === false
        ) {
            section.style.display = "none";
        }


        $("#closeAnnouncement")
            ?.addEventListener(
                "click",
                () => {

                    state.announcementVisible =
                        false;

                    storage.set(
                        "announcementVisible",
                        false
                    );

                    section.style.display =
                        "none";
                }
            );
    };


    /* ========================================================
       PROFILE
       ======================================================== */

    const initProfile = () => {

        $("#profileButton")
            ?.addEventListener(
                "click",
                () => openModal("profileModal")
            );
    };


    /* ========================================================
       SEARCH
       ======================================================== */

    const getSearchableItems = () => {

        return [
            ...state.comics.map(comic => ({
                id: comic.id,
                title: comic.title,
                description:
                    comic.description ||
                    "Truyện",
                type: "comic",
                icon: "book-open"
            })),

            ...state.rooms.map(room => ({
                id: room.id,
                title: room.name,
                description:
                    "Phòng rạp đang hoạt động",
                type: "room",
                icon: "clapperboard"
            })),

            ...state.devices.map(device => ({
                id: device.id,
                title: device.name,
                description:
                    "Thiết bị đang kết nối",
                type: "device",
                icon: "smartphone"
            }))
        ];
    };


    const renderSearchResults = (
        query = ""
    ) => {

        const container =
            $("#globalSearchResults");

        if (!container) return;

        const normalized =
            query.trim().toLowerCase();

        if (!normalized) {

            container.innerHTML = `
                <div class="empty-state">
                    <i data-lucide="search"></i>
                    <p>
                        Bắt đầu nhập để tìm kiếm.
                    </p>
                </div>
            `;

            refreshIcons();

            return;
        }


        const results =
            getSearchableItems()
                .filter(item => {

                    const text =
                        `${item.title} ${item.description}`
                            .toLowerCase();

                    return text.includes(
                        normalized
                    );
                })
                .slice(0, 12);


        if (!results.length) {

            container.innerHTML = `
                <div class="empty-state">
                    <i data-lucide="search-x"></i>
                    <p>
                        Không tìm thấy kết quả.
                    </p>
                </div>
            `;

            refreshIcons();

            return;
        }


        container.innerHTML =
            results.map(item => `
                <button
                    type="button"
                    class="search-result-item"
                    data-search-type="${item.type}"
                    data-search-id="${escapeHtml(item.id)}"
                >

                    <span class="search-result-item-icon">
                        <i data-lucide="${item.icon}"></i>
                    </span>

                    <span>
                        <h3>
                            ${escapeHtml(item.title)}
                        </h3>

                        <p>
                            ${escapeHtml(item.description)}
                        </p>
                    </span>

                </button>
            `).join("");

        refreshIcons();
    };


    const initSearch = () => {

        $("#searchButton")
            ?.addEventListener(
                "click",
                () => {

                    openModal(
                        "searchModal"
                    );

                    const input =
                        $("#globalSearchInput");

                    window.setTimeout(
                        () => input?.focus(),
                        100
                    );

                }
            );


        $("#globalSearchInput")
            ?.addEventListener(
                "input",
                event => {

                    renderSearchResults(
                        event.target.value
                    );

                }
            );


        $("#globalSearchResults")
            ?.addEventListener(
                "click",
                event => {

                    const item =
                        event.target.closest(
                            "[data-search-type]"
                        );

                    if (!item) return;

                    const type =
                        item.dataset.searchType;

                    if (type === "comic") {
                        navigate("read");
                    }

                    if (type === "room") {
                        navigate("watch");
                    }

                    if (type === "device") {
                        navigate("connect");
                    }

                    closeModal(
                        "searchModal"
                    );
                }
            );
    };


    /* ========================================================
       NOTIFICATIONS
       ======================================================== */

    const renderNotifications = () => {

        const container =
            $("#notificationList");

        if (!container) return;

        if (!state.notifications.length) {

            container.innerHTML = `
                <div class="empty-state">
                    <i data-lucide="bell-off"></i>
                    <p>
                        Chưa có thông báo.
                    </p>
                </div>
            `;

            refreshIcons();

            return;
        }


        container.innerHTML =
            state.notifications
                .slice()
                .reverse()
                .map(notification => `

                    <div class="notification-item">

                        <div class="notification-item-icon">
                            <i data-lucide="${escapeHtml(
                                notification.icon ||
                                "bell"
                            )}"></i>
                        </div>

                        <div>

                            <h3>
                                ${escapeHtml(
                                    notification.title
                                )}
                            </h3>

                            <p>
                                ${escapeHtml(
                                    notification.text
                                )}
                            </p>

                        </div>

                    </div>

                `)
                .join("");

        refreshIcons();
    };


    const initNotifications = () => {

        $("#notificationButton")
            ?.addEventListener(
                "click",
                () => {

                    renderNotifications();

                    openModal(
                        "notificationModal"
                    );

                    const dot =
                        $("#notificationDot");

                    if (dot) {
                        dot.style.display =
                            "none";
                    }
                }
            );
    };


    /* ========================================================
       COMICS
       ======================================================== */

    const renderComics = () => {

        const grid =
            $("#comicGrid");

        if (!grid) return;

        const search =
            ($("#comicSearch")?.value || "")
                .trim()
                .toLowerCase();

        const category =
            $("#comicCategory")?.value ||
            "all";


        const filtered =
            state.comics.filter(comic => {

                const matchesSearch =
                    !search ||
                    `${comic.title} ${comic.author || ""} ${comic.description || ""}`
                        .toLowerCase()
                        .includes(search);

                const matchesCategory =
                    category === "all" ||
                    comic.category === category;

                return (
                    matchesSearch &&
                    matchesCategory
                );
            });


        if (!filtered.length) {

            grid.innerHTML = `
                <article class="comic-placeholder glass-card">

                    <div class="placeholder-icon">
                        <i data-lucide="search-x"></i>
                    </div>

                    <h3>
                        Không tìm thấy truyện
                    </h3>

                    <p>
                        Thử từ khóa hoặc thể loại khác.
                    </p>

                </article>
            `;

            refreshIcons();

            return;
        }


        grid.innerHTML =
            filtered.map(comic => {

                const cover =
                    comic.cover &&
                    isValidUrl(comic.cover)
                        ? `
                            <img
                                class="comic-card-image"
                                src="${escapeHtml(
                                    comic.cover
                                )}"
                                alt="${escapeHtml(
                                    comic.title
                                )}"
                                loading="lazy"
                            >
                        `
                        : `
                            <div
                                class="comic-card-image"
                                style="
                                    background:
                                    radial-gradient(
                                        circle at 30% 25%,
                                        rgba(255,255,255,.16),
                                        transparent 35%
                                    ),
                                    linear-gradient(
                                        145deg,
                                        #262626,
                                        #080808
                                    );
                                "
                            ></div>
                        `;


                return `

                    <article
                        class="comic-card"
                        data-comic-id="${escapeHtml(
                            comic.id
                        )}"
                    >

                        ${cover}

                        <div class="comic-card-cover"></div>

                        <div class="comic-card-content">

                            <h3 class="comic-card-title">
                                ${escapeHtml(
                                    comic.title
                                )}
                            </h3>

                            <div class="comic-card-meta">
                                ${escapeHtml(
                                    String(
                                        comic.chapters ||
                                        0
                                    )
                                )} chapters
                                •
                                ${escapeHtml(
                                    comic.category ||
                                    "comic"
                                )}
                                •
                                ${escapeHtml(
                                    comic.author ||
                                    "Member"
                                )}
                            </div>

                        </div>

                    </article>

                `;

            }).join("");

        refreshIcons();
    };


    const initComics = () => {

        $("#comicSearch")
            ?.addEventListener(
                "input",
                renderComics
            );


        $("#comicCategory")
            ?.addEventListener(
                "change",
                renderComics
            );


        $("#randomComicButton")
            ?.addEventListener(
                "click",
                () => {

                    if (!state.comics.length) {
                        showToast(
                            "Kho truyện chưa có dữ liệu.",
                            "info"
                        );

                        return;
                    }

                    const comic =
                        state.comics[
                            Math.floor(
                                Math.random() *
                                state.comics.length
                            )
                        ];

                    showToast(
                        `Gợi ý: ${comic.title}`,
                        "success"
                    );

                    const comicCard =
                        $(
                            `[data-comic-id="${CSS.escape(
                                comic.id
                            )}"]`
                        );

                    comicCard?.scrollIntoView({
                        behavior: "smooth",
                        block: "center"
                    });
                }
            );


        $("#comicGrid")
            ?.addEventListener(
                "click",
                event => {

                    const card =
                        event.target.closest(
                            "[data-comic-id]"
                        );

                    if (!card) return;

                    const comic =
                        state.comics.find(
                            item =>
                                item.id ===
                                card.dataset.comicId
                        );

                    if (!comic) return;

                    /*
                     * Điểm nối để mở reader thật.
                     */
                    window.dispatchEvent(
                        new CustomEvent(
                            "hiliu:open-reader",
                            {
                                detail: comic
                            }
                        )
                    );

                    showToast(
                        `${comic.title} đã được chọn.`,
                        "info"
                    );
                }
            );


        renderComics();
    };


    /* ========================================================
       WATCH ROOMS
       ======================================================== */

    const renderWatchRooms = () => {

        const list =
            $("#watchRoomList");

        const count =
            $("#watchRoomCount");

        if (!list) return;


        if (count) {
            count.textContent =
                `${state.rooms.length} phòng`;
        }


        if (!state.rooms.length) {

            list.innerHTML = `
                <div class="empty-state">

                    <i data-lucide="moon"></i>

                    <p>
                        Chưa có phòng công khai.
                    </p>

                </div>
            `;

            refreshIcons();

            return;
        }


        list.innerHTML =
            state.rooms.map(room => {

                const privacy =
                    room.privacy === "private"
                        ? "Riêng tư"
                        : room.privacy === "invite"
                            ? "Được mời"
                            : "Công khai";


                return `

                    <div
                        class="room-item"
                        data-room-id="${escapeHtml(
                            room.id
                        )}"
                    >

                        <div class="room-item-icon">

                            <i
                                data-lucide="clapperboard"
                            ></i>

                        </div>


                        <div class="room-item-info">

                            <h3>
                                ${escapeHtml(
                                    room.name
                                )}
                            </h3>

                            <span>
                                ${escapeHtml(privacy)}
                                •
                                ${escapeHtml(
                                    String(
                                        room.members ||
                                        1
                                    )
                                )} người
                            </span>

                        </div>


                        <button
                            type="button"
                            class="btn btn-secondary join-room-button"
                            data-room-id="${escapeHtml(
                                room.id
                            )}"
                        >
                            Vào phòng
                        </button>

                    </div>
                `;

            }).join("");

        refreshIcons();
    };


    const initWatchRooms = () => {

        $("#createWatchRoom")
            ?.addEventListener(
                "click",
                () => {

                    $("#watchRoomForm")
                        ?.reset();

                    $("#roomPasswordField")
                        ?.setAttribute(
                            "hidden",
                            ""
                        );

                    openModal(
                        "watchRoomModal"
                    );
                }
            );


        $("#roomPrivacy")
            ?.addEventListener(
                "change",
                event => {

                    const field =
                        $("#roomPasswordField");

                    if (!field) return;

                    if (
                        event.target.value ===
                        "private"
                    ) {
                        field.removeAttribute(
                            "hidden"
                        );
                    } else {
                        field.setAttribute(
                            "hidden",
                            ""
                        );
                    }
                }
            );


        $("#watchRoomForm")
            ?.addEventListener(
                "submit",
                event => {

                    event.preventDefault();

                    const name =
                        $("#roomName")?.value
                            .trim();

                    const url =
                        $("#roomVideoUrl")?.value
                            .trim();

                    const privacy =
                        $("#roomPrivacy")?.value ||
                        "public";

                    const password =
                        $("#roomPassword")?.value ||
                        "";


                    if (!name) {
                        showToast(
                            "Hãy nhập tên phòng.",
                            "error"
                        );

                        return;
                    }


                    if (!isValidUrl(url)) {
                        showToast(
                            "Link video không hợp lệ.",
                            "error"
                        );

                        return;
                    }


                    if (
                        privacy === "private" &&
                        password.length < 1
                    ) {
                        showToast(
                            "Phòng riêng tư cần mật khẩu.",
                            "error"
                        );

                        return;
                    }


                    const room = {
                        id: randomId(12),
                        name,
                        videoUrl: url,
                        privacy,
                        password,
                        chatEnabled:
                            $("#roomChatEnabled")
                                ?.checked ?? true,
                        syncEnabled:
                            $("#roomSyncEnabled")
                                ?.checked ?? true,
                        members: 1,
                        createdAt: Date.now()
                    };


                    state.rooms.unshift(room);

                    storage.set(
                        "watchRooms",
                        state.rooms
                    );

                    renderWatchRooms();

                    closeModal(
                        "watchRoomModal"
                    );


                    showToast(
                        "Đã tạo phòng rạp.",
                        "success"
                    );


                    /*
                     * Gửi thông tin phòng cho backend
                     * nếu WebSocket đang hoạt động.
                     */
                    signalSend({
                        type: "room:create",
                        room
                    });
                }
            );


        $("#watchRoomList")
            ?.addEventListener(
                "click",
                event => {

                    const button =
                        event.target.closest(
                            ".join-room-button"
                        );

                    if (!button) return;

                    const room =
                        state.rooms.find(
                            item =>
                                item.id ===
                                button.dataset.roomId
                        );

                    if (!room) return;


                    if (
                        room.privacy ===
                        "private"
                    ) {

                        const password =
                            window.prompt(
                                "Nhập mật khẩu phòng:"
                            );

                        if (
                            password !==
                            room.password
                        ) {

                            showToast(
                                "Mật khẩu không đúng.",
                                "error"
                            );

                            return;
                        }
                    }


                    if (
                        room.privacy ===
                        "invite"
                    ) {

                        showToast(
                            "Phòng này chỉ dành cho người được mời.",
                            "info"
                        );

                        return;
                    }


                    window.dispatchEvent(
                        new CustomEvent(
                            "hiliu:join-room",
                            {
                                detail: room
                            }
                        )
                    );


                    showToast(
                        `Đã vào ${room.name}.`,
                        "success"
                    );

                    /*
                     * Reader thật có thể mở tại đây.
                     */
                    signalSend({
                        type: "room:join",
                        roomId: room.id
                    });
                }
            );


        renderWatchRooms();
    };


    /* ========================================================
       DEVICE / PAIRING
       ======================================================== */

    const getDeviceName = () => {

        const platform =
            navigator.userAgentData?.platform ||
            navigator.platform ||
            "Browser";

        if (
            /Android/i.test(
                navigator.userAgent
            )
        ) {
            return "Android Device";
        }

        if (
            /iPhone|iPad|iPod/i.test(
                navigator.userAgent
            )
        ) {
            return "Apple Device";
        }

        if (
            /Mac/i.test(
                platform
            )
        ) {
            return "Mac";
        }

        if (
            /Win/i.test(
                platform
            )
        ) {
            return "Windows PC";
        }

        return "Web Browser";
    };


    const getLocalDevice = () => {

        let id =
            storage.get(
                "deviceId",
                null
            );

        if (!id) {

            id =
                crypto?.randomUUID?.() ||
                randomId(16);

            storage.set(
                "deviceId",
                id
            );
        }


        return {
            id,
            name:
                storage.get(
                    "deviceName",
                    getDeviceName()
                ),
            userAgent:
                navigator.userAgent,
            online: true,
            connectedAt:
                Date.now(),
            owner:
                "You"
        };
    };


    const updateLocalDevice = () => {

        const localDevice =
            getLocalDevice();

        const existingIndex =
            state.devices.findIndex(
                item =>
                    item.id === localDevice.id
            );


        if (existingIndex >= 0) {

            state.devices[
                existingIndex
            ] = {
                ...state.devices[
                    existingIndex
                ],
                ...localDevice,
                online: true
            };

        } else {

            /*
             * Chỉ lưu thiết bị local.
             *
             * Thiết bị từ xa sẽ được backend
             * đẩy vào danh sách.
             */
            state.devices.push(
                localDevice
            );
        }


        storage.set(
            "devices",
            state.devices
        );
    };


    const renderDevices = () => {

        const list =
            $("#deviceList");

        const count =
            $("#connectedDeviceCount");

        if (!list) return;


        const remoteDevices =
            state.devices.filter(
                device =>
                    device.id !==
                    getLocalDevice().id
            );


        if (count) {
            count.textContent =
                `${remoteDevices.length} thiết bị`;
        }


        if (!remoteDevices.length) {

            list.innerHTML = `
                <div class="empty-state">

                    <i data-lucide="monitor-smartphone"></i>

                    <p>
                        Chưa có thiết bị khác được ghép cặp.
                    </p>

                </div>
            `;

            refreshIcons();

            return;
        }


        list.innerHTML =
            remoteDevices.map(device => `

                <div
                    class="device-item"
                    data-device-id="${escapeHtml(
                        device.id
                    )}"
                >

                    <div class="device-item-icon">

                        <i data-lucide="smartphone"></i>

                    </div>


                    <div class="device-item-info">

                        <h3>
                            ${escapeHtml(
                                device.name ||
                                "Unknown Device"
                            )}
                        </h3>

                        <p>
                            ${device.online
                                ? "Đang online"
                                : "Offline"}
                        </p>

                    </div>


                    <span
                        class="device-online"
                        style="
                            opacity:
                            ${device.online
                                ? "1"
                                : ".25"}
                        "
                    ></span>


                    <button
                        type="button"
                        class="icon-btn small pair-device-button"
                        title="Ghép cặp"
                        data-device-id="${escapeHtml(
                            device.id
                        )}"
                    >

                        <i data-lucide="link"></i>

                    </button>

                </div>

            `).join("");

        refreshIcons();
    };


    const updatePairCode = () => {

        if (!state.pairCode) {
            state.pairCode =
                randomPairCode();

            storage.set(
                "pairCode",
                state.pairCode
            );
        }


        const output =
            $("#pairCode");

        if (output) {
            output.textContent =
                state.pairCode;
        }
    };


    const regeneratePairCode = () => {

        state.pairCode =
            randomPairCode();

        storage.set(
            "pairCode",
            state.pairCode
        );

        updatePairCode();

        signalSend({
            type: "pair:announce",
            code: state.pairCode,
            device: getLocalDevice()
        });

        showToast(
            "Đã tạo mã ghép cặp mới.",
            "success"
        );
    };


    const pairDevice = (deviceId) => {

        const device =
            state.devices.find(
                item =>
                    item.id === deviceId
            );

        if (!device) return;

        state.selectedDeviceId =
            deviceId;

        storage.set(
            "selectedDeviceId",
            deviceId
        );

        showToast(
            `Đã chọn ${device.name}.`,
            "success"
        );


        signalSend({
            type: "pair:request",
            target: deviceId,
            from: getLocalDevice(),
            code: state.pairCode
        });


        /*
         * Tự tạo kết nối WebRTC cho device nếu backend
         * gửi peer information.
         */
        preparePeerConnection(
            deviceId,
            true
        );
    };


    const initConnectPage = () => {

        updateLocalDevice();

        updatePairCode();

        renderDevices();


        $("#currentDeviceName")
            ?.replaceChildren(
                document.createTextNode(
                    getLocalDevice().name
                )
            );


        $("#currentDeviceInfo")
            ?.replaceChildren(
                document.createTextNode(
                    `${navigator.platform || "Browser"} • HILIU_Q`
                )
            );


        $("#generatePairCode")
            ?.addEventListener(
                "click",
                regeneratePairCode
            );


        $("#copyPairCode")
            ?.addEventListener(
                "click",
                async () => {

                    if (!state.pairCode) {
                        return;
                    }

                    try {

                        await navigator.clipboard.writeText(
                            state.pairCode
                        );

                        showToast(
                            "Đã sao chép mã ghép cặp.",
                            "success"
                        );

                    } catch {

                        showToast(
                            "Không thể sao chép tự động.",
                            "error"
                        );
                    }
                }
            );


        $("#disconnectDevice")
            ?.addEventListener(
                "click",
                () => {

                    if (
                        state.selectedDeviceId
                    ) {

                        closePeerConnection(
                            state.selectedDeviceId
                        );

                        state.selectedDeviceId =
                            null;

                        storage.remove(
                            "selectedDeviceId"
                        );

                        showToast(
                            "Đã ngắt thiết bị.",
                            "success"
                        );

                    } else {

                        showToast(
                            "Chưa chọn thiết bị.",
                            "info"
                        );
                    }
                }
            );


        $("#deviceList")
            ?.addEventListener(
                "click",
                event => {

                    const button =
                        event.target.closest(
                            ".pair-device-button"
                        );

                    if (!button) return;

                    pairDevice(
                        button.dataset.deviceId
                    );
                }
            );


        setInterval(() => {

            const status =
                $("#deviceConnectionStatus");

            if (!status) return;

            const isOnline =
                navigator.onLine;

            status.innerHTML = `
                <span></span>
                ${isOnline
                    ? "Online"
                    : "Offline"}
            `;

            refreshIcons();

        }, 4000);
    };


    /* ========================================================
       FILE TRANSFER UI
       ======================================================== */

    const renderTransferQueue = () => {

        const container =
            $("#transferList");

        if (!container) return;


        if (!state.transferQueue.length) {

            container.innerHTML = "";

            return;
        }


        container.innerHTML =
            state.transferQueue.map(item => `

                <div
                    class="transfer-item"
                    data-transfer-id="${escapeHtml(
                        item.id
                    )}"
                >

                    <div class="transfer-item-icon">

                        <i data-lucide="${getFileIcon(
                            item.file
                        )}"></i>

                    </div>


                    <div class="transfer-item-info">

                        <h4>
                            ${escapeHtml(
                                item.file.name
                            )}
                        </h4>

                        <span>
                            ${formatFileSize(
                                item.file.size
                            )}
                            •
                            ${escapeHtml(
                                item.status
                            )}
                        </span>

                    </div>


                    <div class="transfer-progress">

                        <span
                            style="width:${item.progress}%"
                        ></span>

                    </div>

                </div>

            `).join("");

        refreshIcons();
    };


    const addFilesToTransferQueue = (
        files
    ) => {

        [...files].forEach(file => {

            const item = {
                id: randomId(12),
                file,
                progress: 0,
                status:
                    "Chờ gửi"
            };

            state.transferQueue.push(
                item
            );

            simulateTransfer(
                item
            );

        });


        renderTransferQueue();
    };


    const simulateTransfer = async (
        item
    ) => {

        /*
         * Đây là frontend simulator.
         *
         * Khi backend/WebRTC DataChannel được nối,
         * thay hàm này bằng sendFileByDataChannel().
         */

        item.status =
            state.selectedDeviceId
                ? "Đang chuẩn bị"
                : "Chọn thiết bị để gửi";


        renderTransferQueue();

        if (!state.selectedDeviceId) {
            return;
        }


        item.status =
            "Đang gửi";


        for (
            let progress = 0;
            progress <= 100;
            progress += Math.floor(
                7 + Math.random() * 13
            )
        ) {

            await sleep(
                90 + Math.random() * 100
            );

            item.progress =
                Math.min(
                    progress,
                    100
                );

            renderTransferQueue();
        }


        item.progress = 100;

        item.status =
            "Hoàn tất";


        renderTransferQueue();


        signalSend({
            type: "file:meta",
            target:
                state.selectedDeviceId,
            file: {
                name:
                    item.file.name,
                size:
                    item.file.size,
                type:
                    item.file.type
            }
        });


        showToast(
            `${item.file.name} đã xử lý xong.`,
            "success"
        );
    };


    const initFileTransfer = () => {

        const input =
            $("#fileInput");

        const chooseButton =
            $("#chooseFileButton");

        const dropzone =
            $("#dropzone");


        chooseButton
            ?.addEventListener(
                "click",
                () => input?.click()
            );


        input
            ?.addEventListener(
                "change",
                event => {

                    addFilesToTransferQueue(
                        event.target.files
                    );

                    input.value = "";
                }
            );


        if (!dropzone) return;


        [
            "dragenter",
            "dragover"
        ].forEach(type => {

            dropzone.addEventListener(
                type,
                event => {

                    event.preventDefault();

                    dropzone.classList.add(
                        "dragover"
                    );
                }
            );

        });


        [
            "dragleave",
            "drop"
        ].forEach(type => {

            dropzone.addEventListener(
                type,
                event => {

                    event.preventDefault();

                    dropzone.classList.remove(
                        "dragover"
                    );
                }
            );

        });


        dropzone.addEventListener(
            "drop",
            event => {

                const files =
                    event.dataTransfer?.files;

                if (
                    files &&
                    files.length
                ) {
                    addFilesToTransferQueue(
                        files
                    );
                }
            }
        );
    };


    /* ========================================================
       WEBRTC
       ======================================================== */

    const createPeerConnection = (
        deviceId
    ) => {

        if (
            state.peerConnections.has(
                deviceId
            )
        ) {
            return state.peerConnections.get(
                deviceId
            );
        }


        if (
            !window.RTCPeerConnection
        ) {

            showToast(
                "Trình duyệt không hỗ trợ WebRTC.",
                "error"
            );

            return null;
        }


        const pc =
            new RTCPeerConnection({
                iceServers: [
                    {
                        urls:
                            "stun:stun.l.google.com:19302"
                    },
                    {
                        urls:
                            "stun:stun.cloudflare.com:3478"
                    }
                ]
            });


        state.peerConnections.set(
            deviceId,
            pc
        );


        pc.onicecandidate =
            event => {

                if (
                    !event.candidate
                ) {
                    return;
                }


                signalSend({
                    type: "webrtc:candidate",
                    target: deviceId,
                    from:
                        getLocalDevice().id,
                    candidate:
                        event.candidate
                });
            };


        pc.onconnectionstatechange =
            () => {

                const connectionState =
                    pc.connectionState;


                if (
                    connectionState ===
                    "connected"
                ) {

                    showToast(
                        "WebRTC đã kết nối.",
                        "success"
                    );

                }


                if (
                    [
                        "failed",
                        "disconnected",
                        "closed"
                    ].includes(
                        connectionState
                    )
                ) {

                    closePeerConnection(
                        deviceId
                    );
                }
            };


        pc.ondatachannel =
            event => {

                attachDataChannel(
                    deviceId,
                    event.channel
                );
            };


        pc.ontrack =
            event => {

                handleRemoteTrack(
                    deviceId,
                    event
                );
            };


        return pc;
    };


    const preparePeerConnection = async (
        deviceId,
        createOffer = false
    ) => {

        const pc =
            createPeerConnection(
                deviceId
            );

        if (!pc) return;


        if (
            createOffer
        ) {

            const channel =
                pc.createDataChannel(
                    "hiliu-transfer",
                    {
                        ordered: true
                    }
                );


            attachDataChannel(
                deviceId,
                channel
            );


            try {

                const offer =
                    await pc.createOffer();

                await pc.setLocalDescription(
                    offer
                );


                signalSend({
                    type: "webrtc:offer",
                    target: deviceId,
                    from:
                        getLocalDevice().id,
                    description:
                        pc.localDescription
                });

            } catch (error) {

                console.error(
                    "WebRTC offer error:",
                    error
                );

            }
        }


        return pc;
    };


    const attachDataChannel = (
        deviceId,
        channel
    ) => {

        if (!channel) return;


        channel.onopen =
            () => {

                showToast(
                    "Kênh trao đổi dữ liệu đã mở.",
                    "success"
                );

            };


        channel.onclose =
            () => {

                console.info(
                    "DataChannel closed:",
                    deviceId
                );

            };


        channel.onerror =
            error => {

                console.error(
                    "DataChannel error:",
                    error
                );

            };


        channel.onmessage =
            event => {

                handleDataChannelMessage(
                    deviceId,
                    event.data
                );
            };
    };


    const handleDataChannelMessage = (
        deviceId,
        data
    ) => {

        if (typeof data === "string") {

            const message =
                safeJsonParse(
                    data,
                    null
                );

            if (
                message?.type ===
                "chat"
            ) {

                receiveMessage(
                    deviceId,
                    message.text
                );
            }
        }
    };


    const sendDataChannelMessage = (
        deviceId,
        payload
    ) => {

        const pc =
            state.peerConnections.get(
                deviceId
            );

        if (!pc) {
            return false;
        }


        const channel =
            pc
                .__hiliuDataChannel;


        if (
            !channel ||
            channel.readyState !==
            "open"
        ) {
            return false;
        }


        channel.send(
            JSON.stringify(payload)
        );

        return true;
    };


    const handleRemoteTrack = (
        deviceId,
        event
    ) => {

        const stream =
            event.streams?.[0];

        if (!stream) return;


        let video =
            $("#remoteMediaVideo");


        /*
         * Tạo viewer tự động.
         */
        if (!video) {

            const container =
                $(".media-preview");

            if (!container) {
                return;
            }


            video =
                document.createElement(
                    "video"
                );

            video.id =
                "remoteMediaVideo";

            video.autoplay = true;
            video.playsInline = true;

            container.prepend(
                video
            );
        }


        video.srcObject =
            stream;


        const placeholder =
            $("#mediaPreviewPlaceholder");

        if (placeholder) {
            placeholder.style.display =
                "none";
        }


        showToast(
            `Đã nhận tín hiệu từ thiết bị.`,
            "success"
        );
    };


    const closePeerConnection = (
        deviceId
    ) => {

        const pc =
            state.peerConnections.get(
                deviceId
            );

        if (!pc) return;


        try {
            pc.close();
        } catch {}


        state.peerConnections.delete(
            deviceId
        );

        state.pendingCandidates.delete(
            deviceId
        );
    };


    const acceptOffer = async (
        message
    ) => {

        const deviceId =
            message.from;

        const pc =
            createPeerConnection(
                deviceId
            );

        if (!pc) return;


        try {

            await pc.setRemoteDescription(
                new RTCSessionDescription(
                    message.description
                )
            );


            const answer =
                await pc.createAnswer();

            await pc.setLocalDescription(
                answer
            );


            signalSend({
                type: "webrtc:answer",
                target: deviceId,
                from:
                    getLocalDevice().id,
                description:
                    pc.localDescription
            });

        } catch (error) {

            console.error(
                "WebRTC answer error:",
                error
            );
        }
    };


    const acceptAnswer = async (
        message
    ) => {

        const pc =
            state.peerConnections.get(
                message.from
            );

        if (!pc) return;


        try {

            await pc.setRemoteDescription(
                new RTCSessionDescription(
                    message.description
                )
            );

        } catch (error) {

            console.error(
                "WebRTC answer handling error:",
                error
            );
        }
    };


    const acceptCandidate = async (
        message
    ) => {

        const pc =
            state.peerConnections.get(
                message.from
            );

        if (!pc) return;


        try {

            await pc.addIceCandidate(
                message.candidate
            );

        } catch (error) {

            console.error(
                "ICE candidate error:",
                error
            );
        }
    };


    /* ========================================================
       SCREEN / CAMERA SHARE
       ======================================================== */

    const stopLocalMedia = () => {

        if (
            state.localMediaStream
        ) {

            state.localMediaStream
                .getTracks()
                .forEach(track => {

                    try {
                        track.stop();
                    } catch {}

                });
        }


        state.localMediaStream =
            null;

        state.mediaType =
            null;


        const preview =
            $("#localMediaPreview");

        if (preview) {

            preview.srcObject =
                null;

        }


        const placeholder =
            $("#mediaPreviewPlaceholder");

        if (placeholder) {

            placeholder.style.display =
                "flex";

        }


        /*
         * Báo cho peer dừng media.
         */
        if (
            state.selectedDeviceId
        ) {

            signalSend({
                type: "media:stop",
                target:
                    state.selectedDeviceId
            });
        }
    };


    const openMediaModal = (
        title
    ) => {

        const titleElement =
            $("#mediaModalTitle");

        if (titleElement) {
            titleElement.textContent =
                title;
        }


        openModal(
            "mediaModal"
        );
    };


    const startCameraShare = async () => {

        if (
            !navigator.mediaDevices?.getUserMedia
        ) {

            showToast(
                "Trình duyệt không hỗ trợ camera.",
                "error"
            );

            return;
        }


        try {

            stopLocalMedia();

            const stream =
                await navigator.mediaDevices
                    .getUserMedia({
                        video: true,
                        audio: true
                    });


            state.localMediaStream =
                stream;

            state.mediaType =
                "camera";


            const preview =
                $("#localMediaPreview");

            const placeholder =
                $("#mediaPreviewPlaceholder");


            if (preview) {

                preview.srcObject =
                    stream;

                preview.muted =
                    true;

                await preview.play()
                    .catch(() => {});

            }


            if (placeholder) {
                placeholder.style.display =
                    "none";
            }


            openMediaModal(
                "Đang chia sẻ camera"
            );


            attachTracksToPeers(
                stream
            );


            signalSend({
                type: "media:start",
                mediaType: "camera",
                target:
                    state.selectedDeviceId
            });


            showToast(
                "Camera đã được bật.",
                "success"
            );

        } catch (error) {

            console.error(
                "Camera error:",
                error
            );


            showToast(
                "Không thể mở camera hoặc người dùng đã từ chối quyền.",
                "error"
            );
        }
    };


    const startScreenShare = async () => {

        if (
            !navigator.mediaDevices?.getDisplayMedia
        ) {

            showToast(
                "Trình duyệt không hỗ trợ chia sẻ màn hình.",
                "error"
            );

            return;
        }


        try {

            stopLocalMedia();

            const stream =
                await navigator.mediaDevices
                    .getDisplayMedia({
                        video: true,
                        audio: true
                    });


            state.localMediaStream =
                stream;

            state.mediaType =
                "screen";


            const preview =
                $("#localMediaPreview");

            const placeholder =
                $("#mediaPreviewPlaceholder");


            if (preview) {

                preview.srcObject =
                    stream;

                preview.muted =
                    true;

                await preview.play()
                    .catch(() => {});

            }


            if (placeholder) {
                placeholder.style.display =
                    "none";
            }


            openMediaModal(
                "Đang chia sẻ màn hình"
            );


            attachTracksToPeers(
                stream
            );


            signalSend({
                type: "media:start",
                mediaType: "screen",
                target:
                    state.selectedDeviceId
            });


            /*
             * Người dùng bấm "Dừng chia sẻ" trên browser
             */
            const videoTrack =
                stream.getVideoTracks()[0];

            if (videoTrack) {

                videoTrack.onended =
                    () => {

                        stopLocalMedia();

                        closeModal(
                            "mediaModal"
                        );
                    };
            }


            showToast(
                "Đã bắt đầu chia sẻ màn hình.",
                "success"
            );

        } catch (error) {

            console.error(
                "Screen share error:",
                error
            );


            showToast(
                "Không thể bắt đầu chia sẻ màn hình.",
                "error"
            );
        }
    };


    const attachTracksToPeers = (
        stream
    ) => {

        for (
            const [
                deviceId,
                pc
            ] of state.peerConnections
        ) {

            /*
             * Xóa sender cũ.
             */
            const existingSenders =
                pc.getSenders();

            existingSenders.forEach(
                sender => {

                    if (
                        sender.track &&
                        (
                            sender.track.kind ===
                            "video" ||
                            sender.track.kind ===
                            "audio"
                        )
                    ) {

                        try {
                            pc.removeTrack(
                                sender
                            );
                        } catch {}

                    }
                }
            );


            stream
                .getTracks()
                .forEach(track => {

                    try {

                        pc.addTrack(
                            track,
                            stream
                        );

                    } catch (
                        error
                    ) {

                        console.error(
                            "Track attach error:",
                            error
                        );

                    }
                });


            signalSend({
                type: "webrtc:renegotiate",
                target: deviceId
            });
        }
    };


    const initMediaShare = () => {

        $("#startCameraShare")
            ?.addEventListener(
                "click",
                startCameraShare
            );


        $("#startScreenShare")
            ?.addEventListener(
                "click",
                startScreenShare
            );


        $("#stopMediaButton")
            ?.addEventListener(
                "click",
                () => {

                    stopLocalMedia();

                    closeModal(
                        "mediaModal"
                    );

                    showToast(
                        "Đã dừng chia sẻ.",
                        "success"
                    );
                }
            );


        $("#muteMediaButton")
            ?.addEventListener(
                "click",
                () => {

                    if (
                        !state.localMediaStream
                    ) {

                        showToast(
                            "Chưa có media đang chạy.",
                            "info"
                        );

                        return;
                    }


                    const audioTracks =
                        state.localMediaStream
                            .getAudioTracks();


                    if (!audioTracks.length) {

                        showToast(
                            "Media hiện tại không có micro.",
                            "info"
                        );

                        return;
                    }


                    state.mediaMuted =
                        !state.mediaMuted;


                    audioTracks.forEach(
                        track => {
                            track.enabled =
                                !state.mediaMuted;
                        }
                    );


                    $("#muteMediaButton")
                        .innerHTML = `

                            <i data-lucide="${
                                state.mediaMuted
                                    ? "mic-off"
                                    : "mic"
                            }"></i>

                            ${
                                state.mediaMuted
                                    ? "Bật micro"
                                    : "Tắt micro"
                            }

                        `;

                    refreshIcons();
                }
            );
    };


    /* ========================================================
       SIGNALING / WEBSOCKET
       ======================================================== */

    const isSocketOpen = () => {

        return (
            state.socket &&
            state.socket.readyState ===
            WebSocket.OPEN
        );
    };


    const signalSend = (
        payload
    ) => {

        /*
         * Không có backend => lưu event local
         * để frontend vẫn hoạt động.
         */
        if (!CONFIG.signalUrl) {

            console.debug(
                "[HILIU SIGNAL LOCAL]",
                payload
            );

            return;
        }


        if (
            !isSocketOpen()
        ) {

            console.warn(
                "Signal socket chưa kết nối."
            );

            return;
        }


        try {

            state.socket.send(
                JSON.stringify({
                    ...payload,
                    timestamp:
                        Date.now()
                })
            );

        } catch (
            error
        ) {

            console.error(
                "Signal send error:",
                error
            );
        }
    };


    const connectSignalSocket = () => {

        if (
            !CONFIG.signalUrl ||
            !window.WebSocket
        ) {

            console.info(
                "Realtime backend chưa được cấu hình."
            );

            return;
        }


        try {

            state.socket =
                new WebSocket(
                    CONFIG.signalUrl
                );


            state.socket.onopen =
                () => {

                    console.info(
                        "HILIU realtime connected."
                    );


                    signalSend({
                        type: "device:online",
                        device:
                            getLocalDevice(),
                        pairCode:
                            state.pairCode
                    });


                    updateConnectionStatus(
                        true
                    );
                };


            state.socket.onmessage =
                event => {

                    const message =
                        safeJsonParse(
                            event.data,
                            null
                        );

                    if (
                        message
                    ) {
                        handleSignalMessage(
                            message
                        );
                    }
                };


            state.socket.onerror =
                error => {

                    console.error(
                        "Signal socket error:",
                        error
                    );

                    updateConnectionStatus(
                        false
                    );
                };


            state.socket.onclose =
                () => {

                    console.warn(
                        "HILIU realtime disconnected."
                    );

                    updateConnectionStatus(
                        false
                    );


                    if (
                        state.reconnectTimer
                    ) {
                        return;
                    }


                    state.reconnectTimer =
                        setTimeout(
                            () => {

                                state.reconnectTimer =
                                    null;

                                connectSignalSocket();

                            },
                            4000
                        );
                };

        } catch (error) {

            console.error(
                "Signal connection error:",
                error
            );

        }
    };


    const updateConnectionStatus = (
        connected
    ) => {

        const status =
            $("#deviceConnectionStatus");

        if (!status) return;


        status.innerHTML = `
            <span
                style="
                    background:
                    ${
                        connected
                            ? "var(--green)"
                            : "rgba(255,255,255,.4)"
                    };
                    box-shadow:
                    ${
                        connected
                            ? "0 0 10px rgba(93,242,163,.7)"
                            : "none"
                    };
                "
            ></span>

            ${
                connected
                    ? "Realtime Online"
                    : "Đang chờ"
            }
        `;

        refreshIcons();
    };


    const handleSignalMessage = (
        message
    ) => {

        switch (
            message.type
        ) {

            case "device:list":
                if (
                    Array.isArray(
                        message.devices
                    )
                ) {

                    state.devices =
                        message.devices;

                    renderDevices();
                }
                break;


            case "device:online":
                upsertRemoteDevice(
                    message.device
                );
                break;


            case "device:offline":
                markDeviceOffline(
                    message.deviceId
                );
                break;


            case "pair:accepted":
                if (
                    message.device
                ) {

                    upsertRemoteDevice(
                        message.device
                    );

                    showToast(
                        "Thiết bị đã chấp nhận ghép cặp.",
                        "success"
                    );
                }
                break;


            case "webrtc:offer":
                acceptOffer(
                    message
                );
                break;


            case "webrtc:answer":
                acceptAnswer(
                    message
                );
                break;


            case "webrtc:candidate":
                acceptCandidate(
                    message
                );
                break;


            case "chat":
                receiveMessage(
                    message.from,
                    message.text
                );
                break;


            case "room:list":
                if (
                    Array.isArray(
                        message.rooms
                    )
                ) {

                    state.rooms =
                        message.rooms;

                    renderWatchRooms();
                }
                break;


            case "room:created":
                if (
                    message.room
                ) {

                    if (
                        !state.rooms.some(
                            room =>
                                room.id ===
                                message.room.id
                        )
                    ) {

                        state.rooms.unshift(
                            message.room
                        );

                        storage.set(
                            "watchRooms",
                            state.rooms
                        );

                        renderWatchRooms();
                    }
                }
                break;


            default:

                window.dispatchEvent(
                    new CustomEvent(
                        "hiliu:signal",
                        {
                            detail:
                                message
                        }
                    )
                );
        }
    };


    const upsertRemoteDevice = (
        device
    ) => {

        if (
            !device ||
            !device.id
        ) return;


        const localId =
            getLocalDevice().id;

        if (
            device.id === localId
        ) {
            return;
        }


        const index =
            state.devices.findIndex(
                item =>
                    item.id ===
                    device.id
            );


        if (index >= 0) {

            state.devices[index] = {
                ...state.devices[index],
                ...device,
                online: true
            };

        } else {

            state.devices.push({
                ...device,
                online: true
            });
        }


        renderDevices();
    };


    const markDeviceOffline = (
        deviceId
    ) => {

        const device =
            state.devices.find(
                item =>
                    item.id === deviceId
            );

        if (!device) return;


        device.online =
            false;

        renderDevices();
    };


    /* ========================================================
       MESSENGER
       ======================================================== */

    const getMessagesFor = (
        chatId
    ) => {

        if (
            !Array.isArray(
                state.messages[chatId]
            )
        ) {

            state.messages[chatId] =
                [];
        }

        return state.messages[chatId];
    };


    const saveMessages = () => {

        storage.set(
            "messages",
            state.messages
        );
    };


    const renderConversationList = () => {

        const container =
            $("#conversationList");

        if (!container) return;


        const remoteDevices =
            state.devices.filter(
                device =>
                    device.id !==
                    getLocalDevice().id
            );


        if (!remoteDevices.length) {

            container.innerHTML = `
                <div class="empty-state small">

                    <i data-lucide="message-square"></i>

                    <p>
                        Chưa có cuộc trò chuyện.
                    </p>

                </div>
            `;

            refreshIcons();

            return;
        }


        container.innerHTML =
            remoteDevices
                .map(device => {

                    const messages =
                        getMessagesFor(
                            device.id
                        );

                    const last =
                        messages.at(-1);


                    return `

                        <div
                            class="
                                conversation
                                ${
                                    state.currentChatId ===
                                    device.id
                                        ? "active"
                                        : ""
                                }
                            "
                            data-chat-id="${escapeHtml(
                                device.id
                            )}"
                        >

                            <div class="conversation-avatar">
                                HQ
                            </div>


                            <div class="conversation-info">

                                <h4>
                                    ${escapeHtml(
                                        device.name ||
                                        "Device"
                                    )}
                                </h4>

                                <p>
                                    ${
                                        last
                                            ? escapeHtml(
                                                last.text
                                            )
                                            : "Bắt đầu cuộc trò chuyện"
                                    }
                                </p>

                            </div>

                        </div>

                    `;

                }).join("");

        refreshIcons();
    };


    const renderMessages = () => {

        const container =
            $("#chatMessages");

        if (!container) return;


        if (!state.currentChatId) {

            container.innerHTML = `
                <div class="chat-welcome">

                    <div class="chat-welcome-icon">
                        <i data-lucide="message-circle"></i>
                    </div>

                    <h3>
                        Messenger HILIU_Q
                    </h3>

                    <p>
                        Chọn một thiết bị để bắt đầu.
                    </p>

                </div>
            `;

            refreshIcons();

            return;
        }


        const messages =
            getMessagesFor(
                state.currentChatId
            );


        if (!messages.length) {

            container.innerHTML = `
                <div class="chat-welcome">

                    <div class="chat-welcome-icon">
                        <i data-lucide="send"></i>
                    </div>

                    <h3>
                        Bắt đầu trò chuyện
                    </h3>

                    <p>
                        Hãy gửi tin nhắn đầu tiên.
                    </p>

                </div>
            `;

            refreshIcons();

            return;
        }


        container.innerHTML =
            messages
                .map(message => `

                    <div
                        class="
                            chat-message
                            ${
                                message.sender ===
                                "me"
                                    ? "me"
                                    : ""
                            }
                        "
                    >

                        <div class="chat-bubble">
                            ${escapeHtml(
                                message.text
                            )}
                        </div>

                    </div>

                `)
                .join("");


        container.scrollTop =
            container.scrollHeight;
    };


    const selectChat = (
        chatId
    ) => {

        const device =
            state.devices.find(
                item =>
                    item.id === chatId
            );

        if (!device) {

            showToast(
                "Thiết bị không còn khả dụng.",
                "error"
            );

            return;
        }


        state.currentChatId =
            chatId;

        state.selectedDeviceId =
            chatId;


        $("#chatUserName")
            ?.replaceChildren(
                document.createTextNode(
                    device.name ||
                    "Device"
                )
            );


        $("#chatUserStatus")
            ?.replaceChildren(
                document.createTextNode(
                    device.online
                        ? "Đang online"
                        : "Offline"
                )
            );


        renderConversationList();

        renderMessages();


        preparePeerConnection(
            chatId,
            true
        );
    };


    const sendMessage = (
        text
    ) => {

        const target =
            state.currentChatId;

        if (!target) {

            showToast(
                "Hãy chọn một thiết bị.",
                "error"
            );

            return;
        }


        text =
            text.trim();

        if (!text) return;


        const message = {
            id: randomId(14),
            sender: "me",
            text,
            timestamp:
                Date.now()
        };


        const list =
            getMessagesFor(
                target
            );


        list.push(
            message
        );


        saveMessages();

        renderMessages();

        renderConversationList();


        const dataChannelSent =
            sendDataChannelMessage(
                target,
                {
                    type: "chat",
                    text
                }
            );


        /*
         * Nếu DataChannel chưa sẵn sàng thì gửi
         * qua signaling WebSocket.
         */
        if (!dataChannelSent) {

            signalSend({
                type: "chat",
                target,
                from:
                    getLocalDevice().id,
                text
            });
        }


        showToast(
            "Đã gửi tin nhắn.",
            "success",
            1300
        );
    };


    const receiveMessage = (
        senderId,
        text
    ) => {

        if (!senderId || !text) {
            return;
        }


        const list =
            getMessagesFor(
                senderId
            );


        list.push({
            id: randomId(14),
            sender: "remote",
            text,
            timestamp:
                Date.now()
        });


        saveMessages();


        /*
         * Chỉ render nếu đang mở chat này.
         */
        if (
            state.currentChatId ===
            senderId
        ) {

            renderMessages();

        } else {

            const device =
                state.devices.find(
                    item =>
                        item.id ===
                        senderId
                );


            showToast(
                `Tin nhắn mới${
                    device
                        ? ` từ ${device.name}`
                        : ""
                }.`,
                "info"
            );
        }


        renderConversationList();
    };


    const initMessenger = () => {

        $("#conversationList")
            ?.addEventListener(
                "click",
                event => {

                    const conversation =
                        event.target.closest(
                            "[data-chat-id]"
                        );

                    if (!conversation) {
                        return;
                    }

                    selectChat(
                        conversation.dataset.chatId
                    );
                }
            );


        $("#messageForm")
            ?.addEventListener(
                "submit",
                event => {

                    event.preventDefault();

                    const input =
                        $("#messageInput");

                    if (!input) return;

                    sendMessage(
                        input.value
                    );

                    input.value = "";

                    input.focus();
                }
            );


        $("#messageSearch")
            ?.addEventListener(
                "input",
                event => {

                    const query =
                        event.target.value
                            .trim()
                            .toLowerCase();


                    $$(".conversation")
                        .forEach(item => {

                            const text =
                                item.textContent
                                    .toLowerCase();

                            item.style.display =
                                !query ||
                                text.includes(query)
                                    ? ""
                                    : "none";
                        });
                }
            );


        $("#voiceCallButton")
            ?.addEventListener(
                "click",
                () => {

                    if (
                        !state.currentChatId
                    ) {

                        showToast(
                            "Hãy chọn một thiết bị trước.",
                            "info"
                        );

                        return;
                    }


                    signalSend({
                        type: "call:start",
                        callType: "audio",
                        target:
                            state.currentChatId,
                        from:
                            getLocalDevice().id
                    });


                    showToast(
                        "Đang yêu cầu cuộc gọi thoại...",
                        "info"
                    );
                }
            );


        $("#videoCallButton")
            ?.addEventListener(
                "click",
                async () => {

                    if (
                        !state.currentChatId
                    ) {

                        showToast(
                            "Hãy chọn một thiết bị trước.",
                            "info"
                        );

                        return;
                    }


                    await startCameraShare();

                    signalSend({
                        type: "call:start",
                        callType: "video",
                        target:
                            state.currentChatId,
                        from:
                            getLocalDevice().id
                    });
                }
            );


        $("#newChatButton")
            ?.addEventListener(
                "click",
                () => {

                    navigate(
                        "connect"
                    );

                    showToast(
                        "Chọn một thiết bị để bắt đầu chat.",
                        "info"
                    );
                }
            );


        $("#attachMessageButton")
            ?.addEventListener(
                "click",
                () => {

                    $("#fileInput")
                        ?.click();

                    showToast(
                        "Chọn tệp để chuẩn bị gửi.",
                        "info"
                    );
                }
            );


        $("#emojiButton")
            ?.addEventListener(
                "click",
                () => {

                    const input =
                        $("#messageInput");

                    if (!input) return;

                    input.value +=
                        " 🙂";

                    input.focus();
                }
            );


        renderConversationList();

        renderMessages();
    };


    /* ========================================================
       DONATE
       ======================================================== */

    const getBankInfo = () => {

        return storage.get(
            "bankInfo",
            {
                bankName:
                    "B?i Th? Quy?n",
                owner:
                    " 8882319396",
                account:
                    " 8882319396",
                content:
                    "Donate HILIU_Q",
                qr:
                    ""
            }
        );
    };


    const renderBankInfo = () => {

        const data =
            getBankInfo();


        $("#bankName")
            ?.replaceChildren(
                document.createTextNode(
                    data.bankName
                )
            );


        $("#bankOwner")
            ?.replaceChildren(
                document.createTextNode(
                    data.owner
                )
            );


        $("#bankAccount")
            ?.replaceChildren(
                document.createTextNode(
                    data.account
                )
            );


        $("#bankContent")
            ?.replaceChildren(
                document.createTextNode(
                    data.content
                )
            );


        const qr =
            $("#bankDonationCard");

        if (
            qr &&
            data.qr &&
            isValidUrl(data.qr)
        ) {

            const box =
                $(".qr-placeholder", qr);

            if (box) {

                box.innerHTML = `
                    <img
                        src="${escapeHtml(data.qr)}"
                        alt="QR Donate HILIU_Q"
                        style="
                            width:100%;
                            height:100%;
                            object-fit:contain;
                            border-radius:20px;
                        "
                    >
                `;
            }
        }
    };


    const initDonate = () => {

        renderBankInfo();


        $("#copyBankButton")
            ?.addEventListener(
                "click",
                async () => {

                    const data =
                        getBankInfo();


                    const content = [
                        `Ngân hàng: ${data.bankName}`,
                        `Chủ TK: ${data.owner}`,
                        `STK: ${data.account}`,
                        `Nội dung: ${data.content}`
                    ].join("\n");


                    try {

                        await navigator.clipboard
                            .writeText(
                                content
                            );

                        showToast(
                            "Đã sao chép thông tin donate.",
                            "success"
                        );

                    } catch {

                        showToast(
                            "Không thể sao chép tự động.",
                            "error"
                        );
                    }
                }
            );
    };


    /* ========================================================
       REQUEST TRANSLATION
       ======================================================== */

    const initTranslationRequest = () => {

        $("#translationRequestForm")
            ?.addEventListener(
                "submit",
                event => {

                    event.preventDefault();


                    const comicName =
                        $("#requestComicName")
                            ?.value
                            .trim();

                    const source =
                        $("#sourceLanguage")
                            ?.value;

                    const target =
                        $("#targetLanguage")
                            ?.value;

                    const imageCount =
                        $("#imageCount")
                            ?.value;

                    const chapterCount =
                        $("#chapterCount")
                            ?.value;

                    const comicUrl =
                        $("#comicUrl")
                            ?.value
                            .trim();

                    const note =
                        $("#requestNote")
                            ?.value
                            .trim();


                    if (!comicName) {

                        showToast(
                            "Hãy nhập tên truyện.",
                            "error"
                        );

                        return;
                    }


                    if (!source || !target) {

                        showToast(
                            "Hãy chọn ngôn ngữ.",
                            "error"
                        );

                        return;
                    }


                    if (
                        comicUrl &&
                        !isValidUrl(comicUrl)
                    ) {

                        showToast(
                            "Link truyện không hợp lệ.",
                            "error"
                        );

                        return;
                    }


                    const request = {
                        id:
                            randomId(12),
                        comicName,
                        source,
                        target,
                        imageCount,
                        chapterCount,
                        comicUrl,
                        note,
                        createdAt:
                            Date.now()
                    };


                    storage.set(
                        "lastRequest",
                        request
                    );


                    /*
                     * Tạo link Telegram với nội dung yêu cầu.
                     */
                    const message = [
                        "🌑 HILIU_Q — YÊU CẦU DỊCH",
                        "",
                        `📖 Tên truyện: ${comicName}`,
                        `🌍 Ngôn ngữ gốc: ${source}`,
                        `🎯 Ngôn ngữ cần dịch: ${target}`,
                        `🖼️ Số ảnh: ${imageCount || "Không rõ"}`,
                        `📚 Số chapter: ${chapterCount || "Không rõ"}`,
                        comicUrl
                            ? `🔗 Link: ${comicUrl}`
                            : "",
                        note
                            ? `📝 Ghi chú: ${note}`
                            : ""
                    ]
                        .filter(Boolean)
                        .join("\n");


                    const telegramUrl =
                        `https://t.me/hiliu_q?text=${encodeURIComponent(
                            message
                        )}`;


                    window.open(
                        telegramUrl,
                        "_blank",
                        "noopener,noreferrer"
                    );


                    showToast(
                        "Đã tạo nội dung yêu cầu. Telegram sẽ được mở.",
                        "success"
                    );
                }
            );
    };


    /* ========================================================
       LINK TOOL
       ======================================================== */

    const initLinkTool = () => {

        $("#processLinkButton")
            ?.addEventListener(
                "click",
                () => {

                    const input =
                        $("#linkInput");

                    const result =
                        $("#linkResult");

                    if (!input || !result) {
                        return;
                    }


                    const url =
                        input.value.trim();


                    if (!isValidUrl(url)) {

                        result.innerHTML = `
                            <div class="toast error">
                                <i data-lucide="x-circle"></i>
                                <span>
                                    Link không hợp lệ.
                                </span>
                            </div>
                        `;

                        refreshIcons();

                        return;
                    }


                    result.innerHTML = `
                        <div class="toast success">

                            <i data-lucide="check-circle-2"></i>

                            <span>
                                Đã nhận link. Backend Vượt Link có thể
                                xử lý tại đây.
                            </span>

                        </div>
                    `;

                    refreshIcons();


                    /*
                     * Hook cho backend.
                     */
                    signalSend({
                        type: "link:process",
                        url
                    });
                }
            );
    };


    /* ========================================================
       CALLING HELPERS
       ======================================================== */

    const initCallEvents = () => {

        /*
         * Có thể mở rộng thành audio/video call WebRTC
         * hoàn chỉnh khi server signaling được cài đặt.
         */
        window.addEventListener(
            "hiliu:signal",
            event => {

                const message =
                    event.detail;

                if (
                    message?.type ===
                    "call:incoming"
                ) {

                    const accept =
                        window.confirm(
                            "Có cuộc gọi đến. Chấp nhận?"
                        );

                    if (accept) {

                        signalSend({
                            type: "call:accept",
                            callId:
                                message.callId,
                            target:
                                message.from
                        });

                        if (
                            message.callType ===
                            "video"
                        ) {
                            startCameraShare();
                        }

                    } else {

                        signalSend({
                            type: "call:reject",
                            callId:
                                message.callId,
                            target:
                                message.from
                        });
                    }
                }
            }
        );
    };


    /* ========================================================
       ADMIN
       ======================================================== */

    const initAdmin = () => {

        /*
         * Demo: nhấn 5 lần vào logo để bật Admin local.
         *
         * Trong hệ thống thật:
         * KHÔNG dùng localStorage làm xác thực Admin.
         * Phải xác thực ở server.
         */

        let clicks = 0;
        let timer = null;


        $$(".brand").forEach(
            brand => {

                brand.addEventListener(
                    "click",
                    event => {

                        event.preventDefault();

                        clicks++;

                        clearTimeout(
                            timer
                        );

                        timer =
                            setTimeout(
                                () => {
                                    clicks = 0;
                                },
                                1200
                            );


                        if (
                            clicks >= 5
                        ) {

                            clicks = 0;

                            state.isAdmin =
                                !state.isAdmin;

                            storage.set(
                                "isAdmin",
                                state.isAdmin
                            );


                            showToast(
                                state.isAdmin
                                    ? "Admin mode đã bật."
                                    : "Admin mode đã tắt.",
                                "info"
                            );


                            if (
                                state.isAdmin
                            ) {
                                navigate(
                                    "admin"
                                );
                            }
                        }
                    }
                );
            }
        );


        $("#adminAnnouncementButton")
            ?.addEventListener(
                "click",
                () => {

                    const current =
                        $("#globalAnnouncement")
                            ?.textContent ||
                        "";


                    const newText =
                        window.prompt(
                            "Nhập thông báo mới:",
                            current
                        );


                    if (
                        !newText ||
                        !newText.trim()
                    ) {
                        return;
                    }


                    storage.set(
                        "announcement",
                        newText.trim()
                    );


                    const target =
                        $("#globalAnnouncement");

                    if (target) {
                        target.textContent =
                            newText.trim();
                    }


                    showToast(
                        "Đã cập nhật thông báo.",
                        "success"
                    );
                }
            );


        $("#adminLibraryButton")
            ?.addEventListener(
                "click",
                () => {

                    const title =
                        window.prompt(
                            "Tên truyện mới:"
                        );

                    if (
                        !title ||
                        !title.trim()
                    ) {
                        return;
                    }


                    const comic = {
                        id:
                            randomId(12),
                        title:
                            title.trim(),
                        category:
                            "manga",
                        chapters:
                            0,
                        author:
                            "Admin",
                        description:
                            "Truyện do Admin thêm.",
                        cover:
                            ""
                    };


                    state.comics.unshift(
                        comic
                    );


                    storage.set(
                        "comics",
                        state.comics
                    );


                    renderComics();


                    showToast(
                        "Đã thêm truyện.",
                        "success"
                    );
                }
            );


        $("#adminBankButton")
            ?.addEventListener(
                "click",
                () => {

                    const current =
                        getBankInfo();


                    const bankName =
                        window.prompt(
                            "Tên ngân hàng:",
                            current.bankName ===
                            "Chưa cấu hình"
                                ? ""
                                : current.bankName
                        );


                    if (
                        bankName === null
                    ) {
                        return;
                    }


                    const owner =
                        window.prompt(
                            "Tên chủ tài khoản:",
                            current.owner ===
                            "Chưa cấu hình"
                                ? ""
                                : current.owner
                        );


                    if (
                        owner === null
                    ) {
                        return;
                    }


                    const account =
                        window.prompt(
                            "Số tài khoản:",
                            current.account ===
                            "Chưa cấu hình"
                                ? ""
                                : current.account
                        );


                    if (
                        account === null
                    ) {
                        return;
                    }


                    const content =
                        window.prompt(
                            "Nội dung chuyển khoản:",
                            current.content
                        );


                    if (
                        content === null
                    ) {
                        return;
                    }


                    const qr =
                        window.prompt(
                            "Direct URL ảnh QR:",
                            current.qr || ""
                        );


                    if (
                        qr === null
                    ) {
                        return;
                    }


                    storage.set(
                        "bankInfo",
                        {
                            bankName:
                                bankName.trim() ||
                                "Chưa cấu hình",
                            owner:
                                owner.trim() ||
                                "Chưa cấu hình",
                            account:
                                account.trim() ||
                                "Chưa cấu hình",
                            content:
                                content.trim() ||
                                "HILIU_Q",
                            qr:
                                qr.trim()
                        }
                    );


                    renderBankInfo();


                    showToast(
                        "Đã cập nhật Donate.",
                        "success"
                    );
                }
            );


        $("#adminModulesButton")
            ?.addEventListener(
                "click",
                () => {

                    showToast(
                        "Module manager sẽ được nối với backend Admin.",
                        "info"
                    );
                }
            );


        $("#adminMembersButton")
            ?.addEventListener(
                "click",
                () => {

                    showToast(
                        "Member manager đang chờ API quản trị.",
                        "info"
                    );
                }
            );


        $("#adminSettingsButton")
            ?.addEventListener(
                "click",
                () => {

                    showToast(
                        "System settings đang chờ backend configuration.",
                        "info"
                    );
                }
            );


        const savedAnnouncement =
            storage.get(
                "announcement",
                null
            );


        if (
            savedAnnouncement
        ) {

            const element =
                $("#globalAnnouncement");

            if (element) {
                element.textContent =
                    savedAnnouncement;
            }
        }
    };


    /* ========================================================
       MODAL EVENTS
       ======================================================== */

    const initModalEvents = () => {

        $$("[data-close-modal]")
            .forEach(button => {

                button.addEventListener(
                    "click",
                    () => {

                        closeModal(
                            button.dataset.closeModal
                        );

                    }
                );
            });


        $$(".modal-backdrop")
            .forEach(backdrop => {

                backdrop.addEventListener(
                    "click",
                    () => {

                        closeAllModals();

                    }
                );
            });


        document.addEventListener(
            "keydown",
            event => {

                if (
                    event.key ===
                    "Escape"
                ) {

                    closeAllModals();
                    closeMobileSidebar();

                }

            }
        );
    };


    /* ========================================================
       NAV EVENTS
       ======================================================== */

    const initNavigation = () => {

        document.addEventListener(
            "click",
            event => {

                const link =
                    event.target.closest(
                        "[data-route]"
                    );

                if (!link) return;


                const route =
                    link.dataset.route;

                if (!route) return;


                /*
                 * Không chặn link ngoài.
                 */
                if (
                    link.tagName === "A" &&
                    link.target === "_blank"
                ) {
                    return;
                }


                event.preventDefault();

                navigate(route);
            }
        );


        window.addEventListener(
            "hashchange",
            handleHashChange
        );


        window.addEventListener(
            "popstate",
            handleHashChange
        );


        renderRoute(
            state.currentRoute
        );
    };


    /* ========================================================
       MOBILE EVENTS
       ======================================================== */

    const initMobileMenu = () => {

        $("#mobileMenuButton")
            ?.addEventListener(
                "click",
                openMobileSidebar
            );


        $("#closeMobileMenu")
            ?.addEventListener(
                "click",
                closeMobileSidebar
            );
    };


    /* ========================================================
       ONLINE / OFFLINE
       ======================================================== */

    const initNetworkStatus = () => {

        window.addEventListener(
            "online",
            () => {

                showToast(
                    "Đã kết nối mạng.",
                    "success"
                );

                connectSignalSocket();
            }
        );


        window.addEventListener(
            "offline",
            () => {

                showToast(
                    "Thiết bị đang offline.",
                    "error"
                );
            }
        );
    };


    /* ========================================================
       KEYBOARD SHORTCUTS
       ======================================================== */

    const initKeyboardShortcuts = () => {

        document.addEventListener(
            "keydown",
            event => {

                /*
                 * Ctrl/Cmd + K
                 */
                if (
                    (
                        event.ctrlKey ||
                        event.metaKey
                    ) &&
                    event.key.toLowerCase() === "k"
                ) {

                    event.preventDefault();

                    openModal(
                        "searchModal"
                    );

                    window.setTimeout(
                        () =>
                            $("#globalSearchInput")
                                ?.focus(),
                        100
                    );
                }


                /*
                 * Ctrl/Cmd + Shift + M
                 */
                if (
                    (
                        event.ctrlKey ||
                        event.metaKey
                    ) &&
                    event.shiftKey &&
                    event.key.toLowerCase() === "m"
                ) {

                    event.preventDefault();

                    navigate(
                        "messenger"
                    );
                }

            }
        );
    };


    /* ========================================================
       PAGE VISIBILITY
       ======================================================== */

    const initVisibility = () => {

        document.addEventListener(
            "visibilitychange",
            () => {

                if (
                    document.hidden
                ) {

                    signalSend({
                        type: "device:away",
                        deviceId:
                            getLocalDevice().id
                    });

                } else {

                    signalSend({
                        type: "device:online",
                        device:
                            getLocalDevice()
                    });
                }
            }
        );
    };


    /* ========================================================
       BEFORE UNLOAD
       ======================================================== */

    const initUnload = () => {

        window.addEventListener(
            "beforeunload",
            () => {

                signalSend({
                    type: "device:offline",
                    deviceId:
                        getLocalDevice().id
                });


                if (
                    state.localMediaStream
                ) {

                    state.localMediaStream
                        .getTracks()
                        .forEach(track => {

                            try {
                                track.stop();
                            } catch {}

                        });
                }


                for (
                    const [
                        deviceId
                    ] of state.peerConnections
                ) {

                    closePeerConnection(
                        deviceId
                    );
                }
            }
        );
    };


    /* ========================================================
       LOADER
       ======================================================== */

    const hideLoader = async () => {

        const loader =
            $("#pageLoader");

        if (!loader) return;

        await sleep(650);

        loader.classList.add(
            "loaded"
        );
    };


    /* ========================================================
       EXPOSE API
       ======================================================== */

    /*
     * Cho phép backend/module khác gọi các hàm cần thiết.
     */
    window.HILIU = {

        config: CONFIG,

        state,

        navigate,

        showToast,

        openModal,

        closeModal,

        signalSend,

        renderComics,

        renderWatchRooms,

        renderDevices,

        renderMessages,

        sendMessage,

        startCameraShare,

        startScreenShare,

        stopLocalMedia,

        pairDevice,

        getLocalDevice
    };


    /* ========================================================
       INIT
       ======================================================== */

    const init = async () => {

        try {

            ensureDefaults();

            initNavigation();

            initMobileMenu();

            initModalEvents();

            initAnnouncement();

            initProfile();

            initSearch();

            initNotifications();

            initComics();

            initWatchRooms();

            initConnectPage();

            initFileTransfer();

            initMediaShare();

            initMessenger();

            initDonate();

            initTranslationRequest();

            initLinkTool();

            initCallEvents();

            initAdmin();

            initNetworkStatus();

            initKeyboardShortcuts();

            initVisibility();

            initUnload();

            connectSignalSocket();

            updatePairCode();

            updateLocalDevice();

            renderDevices();

            renderWatchRooms();

            renderComics();

            renderConversationList();

            renderMessages();

            renderBankInfo();

            refreshIcons();

            hideLoader();

            console.info(
                "%cHILIU_Q Reader Hub%c initialized.",
                "font-weight:800",
                "font-weight:400"
            );

        } catch (error) {

            console.error(
                "HILIU_Q initialization error:",
                error
            );


            const loader =
                $("#pageLoader");

            loader?.classList.add(
                "loaded"
            );


            showToast(
                "Có lỗi khi khởi tạo Reader Hub.",
                "error",
                5000
            );
        }
    };


    /* ========================================================
       START
       ======================================================== */

    if (
        document.readyState ===
        "loading"
    ) {

        document.addEventListener(
            "DOMContentLoaded",
            init,
            {
                once: true
            }
        );

    } else {

        init();

    }

})();
"use strict";

const thoughtsList = document.getElementById("thoughtsList");
const thoughtForm = document.getElementById("thoughtForm");
const thoughtName = document.getElementById("thoughtName");
const thoughtMessage = document.getElementById("thoughtMessage");
const thoughtStatus = document.getElementById("thoughtStatus");
const thoughtSubmit = document.getElementById("thoughtSubmit");
const refreshThoughtsButton = document.getElementById("refreshThoughts");

const supabaseUrl = "https://qojcifhfeyamdmrkhldf.supabase.co";
const supabaseAnonKey = "sb_publishable_SGaHOKPaH41azsf07qrecQ_NkEoVteF";

let thoughtsClient = null;

function setThoughtStatus(message, state) {
    thoughtStatus.textContent = message;
    if (state) {
        thoughtStatus.dataset.state = state;
    } else {
        delete thoughtStatus.dataset.state;
    }
}

function createThoughtElement(post) {
    const article = document.createElement("article");
    article.className = "thought-card";

    const header = document.createElement("div");
    header.className = "thought-card-header";

    const author = document.createElement("strong");
    author.textContent = post.name?.trim() || "Anonymous";
    header.append(author);

    if (post.created_at) {
        const time = document.createElement("time");
        const createdAt = new Date(post.created_at);
        if (!Number.isNaN(createdAt.getTime())) {
            time.dateTime = createdAt.toISOString();
            time.textContent = new Intl.DateTimeFormat(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
            }).format(createdAt);
        }
        if (time.textContent) {
            header.append(time);
        }
    }

    const message = document.createElement("p");
    message.textContent = post.message || "";
    article.append(header, message);
    return article;
}

async function loadThoughts() {
    if (!thoughtsClient) {
        thoughtsList.replaceChildren();
        const errorMessage = document.createElement("p");
        errorMessage.className = "thoughts-placeholder";
        errorMessage.textContent = "The community feed could not connect. Check your internet connection and reload the page.";
        thoughtsList.append(errorMessage);
        setThoughtStatus("The Supabase client did not load. Check your internet connection and reload.", "error");
        return;
    }

    refreshThoughtsButton.disabled = true;
    let data;
    let error;
    try {
        ({ data, error } = await thoughtsClient
            .from("posts")
            .select("name, message, created_at")
            .order("created_at", { ascending: false })
            .limit(100));
    } catch (requestError) {
        error = requestError;
    } finally {
        refreshThoughtsButton.disabled = false;
    }

    if (error) {
        console.error("Could not load community thoughts from Supabase.", error);
        thoughtsList.replaceChildren();
        const errorMessage = document.createElement("p");
        errorMessage.className = "thoughts-placeholder";
        errorMessage.textContent = `Could not load posts: ${error.message || "Check your internet connection and Supabase settings."}`;
        thoughtsList.append(errorMessage);
        return;
    }

    thoughtsList.replaceChildren();
    if (!data || data.length === 0) {
        const emptyMessage = document.createElement("p");
        emptyMessage.className = "thoughts-placeholder";
        emptyMessage.textContent = "No thoughts yet. Be the first to post.";
        thoughtsList.append(emptyMessage);
        return;
    }

    thoughtsList.append(...data.map(createThoughtElement));
}

thoughtForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = thoughtMessage.value.trim();
    if (!message) {
        setThoughtStatus("Write a message before posting.", "error");
        thoughtMessage.focus();
        return;
    }

    if (!thoughtsClient) {
        setThoughtStatus("The community feed is unavailable because Supabase did not load.", "error");
        return;
    }

    if (!window.FarmersAuth) {
        setThoughtStatus("Account sign-in is unavailable. Reload the page and try again.", "error");
        return;
    }

    let user;
    try {
        user = await window.FarmersAuth.getUser();
    } catch (error) {
        console.error("Could not verify the FARMERS account before posting.", error);
        setThoughtStatus(`Could not check your account: ${error.message}`, "error");
        return;
    }
    if (!user) {
        location.href = "auth.html?return=community.html";
        return;
    }

    const name = user.user_metadata?.name || thoughtName.value.trim();
    thoughtSubmit.disabled = true;
    thoughtSubmit.textContent = "Posting...";
    setThoughtStatus("Sending your thought...");
    let error;
    try {
        ({ error } = await thoughtsClient.from("posts").insert([{ name: name || null, message }]));
    } catch (requestError) {
        error = requestError;
    } finally {
        thoughtSubmit.disabled = false;
        thoughtSubmit.textContent = "Post thought";
    }

    if (error) {
        console.error("Could not post community thought to Supabase.", error);
        setThoughtStatus(`Your post could not be saved: ${error.message || "Check your internet connection and Supabase settings."}`, "error");
        return;
    }

    thoughtMessage.value = "";
    setThoughtStatus("Your thought was posted.", "success");
    await loadThoughts();
});

refreshThoughtsButton.addEventListener("click", loadThoughts);

try {
    const savedAccount = JSON.parse(localStorage.getItem("farmersCommunityAccount") || "null");
    if (savedAccount && typeof savedAccount.name === "string") {
        thoughtName.value = savedAccount.name;
    }
} catch (error) {
    console.error("Could not read the saved community account name.", error);
}

if (window.supabase && typeof window.supabase.createClient === "function") {
    thoughtsClient = window.FarmersAuth
        ? window.FarmersAuth.client
        : window.supabase.createClient(supabaseUrl, supabaseAnonKey);
} else {
    console.error("Supabase JavaScript client is unavailable.");
}

loadThoughts();

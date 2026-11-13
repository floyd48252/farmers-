"use strict";

(function () {
    const supabaseUrl = "https://qojcifhfeyamdmrkhldf.supabase.co";
    const supabasePublicKey = "sb_publishable_SGaHOKPaH41azsf07qrecQ_NkEoVteF";
    const allowedReturnPages = new Set([
        "index.html",
        "profile.html",
        "marketplace.html",
        "community.html",
        "subscription.html",
        "farmers-ai.html",
        "market-intelligence.html",
        "resources.html",
        "farmers-library.html"
    ]);

    if (!window.supabase || typeof window.supabase.createClient !== "function") {
        console.error("Supabase authentication is unavailable because its client did not load.");
        return;
    }

    const client = window.supabase.createClient(supabaseUrl, supabasePublicKey);

    function storeAccount(user) {
        if (user) {
            localStorage.setItem("farmersCurrentAccountId", user.id);
        } else {
            localStorage.removeItem("farmersCurrentAccountId");
        }
    }

    async function getUser() {
        const { data, error } = await client.auth.getSession();
        if (error) {
            throw error;
        }
        const user = data.session ? data.session.user : null;
        storeAccount(user);
        return user;
    }

    function getReturnPage(value) {
        return allowedReturnPages.has(value) ? value : "profile.html";
    }

    client.auth.onAuthStateChange((_event, session) => {
        storeAccount(session && session.user);
    });

    window.FarmersAuth = Object.freeze({
        client,
        getUser,
        getReturnPage,
        signOut: () => client.auth.signOut()
    });
}());

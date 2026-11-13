"use strict";

const authForm = document.getElementById("authForm");
const authStatus = document.getElementById("authStatus");
const authSession = document.getElementById("authSession");
const signedInMessage = document.getElementById("signedInMessage");
const authReturnPage = window.FarmersAuth
    ? window.FarmersAuth.getReturnPage(new URLSearchParams(location.search).get("return"))
    : "profile.html";

function setAuthStatus(message, state) {
    authStatus.textContent = message;
    if (state) {
        authStatus.dataset.state = state;
    } else {
        delete authStatus.dataset.state;
    }
}

function setFormBusy(busy) {
    authForm.querySelectorAll("button").forEach((button) => {
        button.disabled = busy;
    });
}

function showSignedIn(user) {
    authSession.hidden = false;
    signedInMessage.textContent = `Signed in as ${user.email}.`;
    document.getElementById("accountEmail").value = user.email || "";
}

function continueToSite() {
    location.href = authReturnPage;
}

if (!window.FarmersAuth) {
    setAuthStatus("Account sign-in could not initialize. Check your internet connection and reload.", "error");
    authForm.querySelectorAll("button").forEach((button) => {
        button.disabled = true;
    });
} else {
    window.FarmersAuth.getUser().then((user) => {
        if (user) {
            showSignedIn(user);
        }
    }).catch((error) => {
        console.error("Could not check the current FARMERS account.", error);
        setAuthStatus(`Could not check your account: ${error.message}`, "error");
    });
}

document.getElementById("continueButton").addEventListener("click", continueToSite);

document.getElementById("signOutButton").addEventListener("click", async () => {
    setAuthStatus("Signing out...");
    const { error } = await window.FarmersAuth.signOut();
    if (error) {
        console.error("Could not sign out of FARMERS.", error);
        setAuthStatus(`Could not sign out: ${error.message}`, "error");
        return;
    }
    authSession.hidden = true;
    setAuthStatus("You have signed out.", "success");
});

authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!window.FarmersAuth || !authForm.reportValidity()) {
        return;
    }

    const email = document.getElementById("accountEmail").value.trim();
    const password = document.getElementById("accountPassword").value;
    setFormBusy(true);
    setAuthStatus("Signing in...");

    try {
        const { data, error } = await window.FarmersAuth.client.auth.signInWithPassword({ email, password });
        if (error) {
            throw error;
        }
        if (!data.user) {
            throw new Error("Supabase did not return an authenticated account.");
        }
        showSignedIn(data.user);
        setAuthStatus("Signed in successfully.", "success");
        continueToSite();
    } catch (error) {
        console.error("Could not sign in to FARMERS.", error);
        setAuthStatus(error.message || "Sign-in failed. Check your email and password.", "error");
    } finally {
        setFormBusy(false);
    }
});

document.getElementById("signUpButton").addEventListener("click", async () => {
    if (!window.FarmersAuth || !authForm.reportValidity()) {
        return;
    }

    const name = document.getElementById("accountName").value.trim();
    const email = document.getElementById("accountEmail").value.trim();
    const password = document.getElementById("accountPassword").value;
    if (!name) {
        document.getElementById("accountName").focus();
        setAuthStatus("Enter your name to create an account.", "error");
        return;
    }

    setFormBusy(true);
    setAuthStatus("Creating your account...");
    try {
        const redirectTo = new URL("auth.html", location.href);
        redirectTo.searchParams.set("return", authReturnPage);
        const { data, error } = await window.FarmersAuth.client.auth.signUp({
            email,
            password,
            options: {
                data: { name },
                emailRedirectTo: redirectTo.href
            }
        });
        if (error) {
            throw error;
        }
        if (data.session && data.user) {
            showSignedIn(data.user);
            setAuthStatus("Account created and signed in.", "success");
            continueToSite();
        } else {
            setAuthStatus("Account created. Check your email for the confirmation link, then sign in here.", "success");
        }
    } catch (error) {
        console.error("Could not create a FARMERS account.", error);
        setAuthStatus(error.message || "Account creation failed.", "error");
    } finally {
        setFormBusy(false);
    }
});

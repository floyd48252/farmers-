"use strict";

const storageKeys = {
    listings: "farmers-marketplace-listings",
    offers: "farmers-marketplace-offers",
};

const supabaseUrl = "https://qojcifhfeyamdmrkhldf.supabase.co";
const supabasePublicKey = "sb_publishable_SGaHOKPaH41azsf07qrecQ_NkEoVteF";

const starterListings = [
    { id: "maize", name: "Fresh Maize", category: "crops", price: 4500, unit: "bag", quantity: 30, seller: "Green Valley Farm", location: "Nakuru", description: "Freshly harvested maize.", image: "crop-rows.jpg" },
    { id: "tomatoes", name: "Fresh Tomatoes", category: "crops", price: 3000, unit: "crate", quantity: 18, seller: "Sunrise Growers", location: "Kiambu", description: "Ripe tomatoes, ready for collection.", image: "market-produce.jpg" },
    { id: "cattle", name: "Dairy Cattle", category: "livestock", price: 85000, unit: "animal", quantity: 2, seller: "Highland Dairy Farm", location: "Nyandarua", description: "Healthy dairy cattle. Contact the farmer for details.", image: "dairy-cow.jpg" },
    { id: "goats", name: "Farm Goats", category: "livestock", price: 12000, unit: "animal", quantity: 6, seller: "Mwangaza Farm", location: "Machakos", description: "Locally raised goats.", image: "goat.jpg" },
    { id: "chickens", name: "Broiler Chickens", category: "poultry", price: 650, unit: "bird", quantity: 40, seller: "Poultry Place", location: "Thika", description: "Healthy broilers, ready for sale.", image: "poultry.jpg" },
    { id: "tilapia", name: "Fresh Tilapia", category: "fish", price: 450, unit: "kg", quantity: 25, seller: "Lakeview Fish Farm", location: "Kisumu", description: "Fresh farmed tilapia.", image: "fish.jpg" },
    { id: "fertilizer", name: "Farm Fertilizer", category: "inputs", price: 4200, unit: "bag", quantity: 12, seller: "Harvest Agro Shop", location: "Eldoret", description: "Ask the seller about available formulations.", image: "seedlings.jpg" },
];

const categoryNames = {
    crops: "Crops",
    livestock: "Livestock",
    poultry: "Poultry",
    fish: "Fish",
    inputs: "Farm inputs",
};

const productGrid = document.getElementById("productGrid");
const searchInput = document.getElementById("marketSearch");
const listingCount = document.getElementById("listingCount");
const emptyState = document.getElementById("emptyState");
const storageNotice = document.getElementById("storageNotice");
const listingDialog = document.getElementById("listingDialog");
const bidDialog = document.getElementById("bidDialog");
const offersDialog = document.getElementById("offersDialog");
const orderDialog = document.getElementById("orderDialog");
const listingForm = document.getElementById("listingForm");
const bidForm = document.getElementById("bidForm");
const bidProductSummary = document.getElementById("bidProductSummary");
const sellerOffersList = document.getElementById("sellerOffersList");
const sellerContact = document.getElementById("sellerContact");
const clearSearchButton = document.getElementById("clearSearch");
const imageInput = document.getElementById("listingImage");
const imagePreview = document.getElementById("imagePreview");
const imagePreviewPhoto = document.getElementById("imagePreviewPhoto");
const imageError = document.getElementById("imageError");
const publishListingButton = document.getElementById("publishListing");
const marketBackendNotice = document.getElementById("marketBackendNotice");
const marketAccountLink = document.getElementById("marketAccountLink");
const orderFarmer = document.getElementById("orderFarmer");
const orderPhoneInfo = document.getElementById("orderPhoneInfo");
const orderSmsLink = document.getElementById("orderSmsLink");
const orderWhatsAppLink = document.getElementById("orderWhatsAppLink");
const copyOrderPhoneButton = document.getElementById("copyOrderPhone");
const orderContactStatus = document.getElementById("orderContactStatus");
let activeCategory = "all";
let selectedListingId = "";
let marketClient = null;
let currentUserId = null;
let remoteListings = [];
let remoteOffers = [];
let selectedImageFile = null;
let imagePreviewUrl = "";
let productImageUrls = [];
let imageDatabasePromise;
let userListings = readStoredArray(storageKeys.listings);
let offers = readStoredArray(storageKeys.offers);

function showStorageError(action) {
    storageNotice.hidden = false;
    storageNotice.textContent = `Marketplace ${action} could not access this browser's saved data. Your changes may not be retained.`;
}

function showBackendNotice(message) {
    marketBackendNotice.hidden = !message;
    marketBackendNotice.textContent = message || "";
}

function updateMarketAccountLink(user) {
    if (!user) {
        marketAccountLink.href = "auth.html?return=marketplace.html";
        marketAccountLink.textContent = "Sign in";
        return;
    }
    marketAccountLink.href = "#";
    marketAccountLink.textContent = "Sign out";
    marketAccountLink.onclick = async (event) => {
        event.preventDefault();
        const { error } = await marketClient.auth.signOut();
        if (error) {
            console.error("Could not sign out of the marketplace.", error);
            showBackendNotice(`Could not sign out: ${error.message}`);
        }
    };
}

function getSupabaseSetupMessage(error) {
    const message = error && error.message ? error.message : "Unknown Supabase error.";
    if (error && error.code === "42703") {
        console.error("The Supabase marketplace table is missing a required column.", error);
        return "";
    }
    if (error && (error.code === "PGRST205" || message.includes("market_listings"))) {
        console.error("Supabase cannot find the marketplace listings table in its API schema.", error);
        return "";
    }
    if (message.toLowerCase().includes("signups not allowed") ||
        message.toLowerCase().includes("signups are disabled")) {
        return "Account creation is not enabled. Turn on email sign-ups in Supabase Dashboard → Authentication → Providers, then reload this page.";
    }
    return `Marketplace connection error: ${message}`;
}

function createImageObjectId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
        return window.crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function readStoredArray(key) {
    try {
        const stored = window.localStorage.getItem(key);
        if (!stored) {
            return [];
        }
        const parsed = JSON.parse(stored);
        if (!Array.isArray(parsed)) {
            throw new TypeError("Saved marketplace data must be a list.");
        }
        return parsed;
    } catch (error) {
        console.error("Could not read marketplace data.", error);
        showStorageError("could not load");
        return [];
    }
}

function saveStoredArray(key, value) {
    try {
        window.localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (error) {
        console.error("Could not save marketplace data.", error);
        showStorageError("could not save");
        return false;
    }
}

function openImageDatabase() {
    if (!window.indexedDB) {
        return Promise.reject(new Error("This browser does not support persistent product images."));
    }

    if (!imageDatabasePromise) {
        imageDatabasePromise = new Promise((resolve, reject) => {
            const request = window.indexedDB.open("farmers-marketplace-images", 1);
            request.onupgradeneeded = () => {
                request.result.createObjectStore("images", { keyPath: "id" });
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error("Could not open product image storage."));
            request.onblocked = () => reject(new Error("Product image storage is blocked by another browser tab."));
        });
    }

    return imageDatabasePromise;
}

async function saveProductImage(id, blob) {
    const database = await openImageDatabase();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction("images", "readwrite");
        transaction.objectStore("images").put({ id, blob });
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || new Error("Could not save product image."));
        transaction.onabort = () => reject(transaction.error || new Error("Saving the product image was cancelled."));
    });
}

async function getProductImage(id) {
    const database = await openImageDatabase();
    return new Promise((resolve, reject) => {
        const request = database.transaction("images", "readonly").objectStore("images").get(id);
        request.onsuccess = () => resolve(request.result ? request.result.blob : null);
        request.onerror = () => reject(request.error || new Error("Could not load product image."));
    });
}

async function deleteProductImage(id) {
    const database = await openImageDatabase();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction("images", "readwrite");
        transaction.objectStore("images").delete(id);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || new Error("Could not remove product image."));
        transaction.onabort = () => reject(transaction.error || new Error("Removing the product image was cancelled."));
    });
}

async function initializeRemoteMarketplace() {
    showBackendNotice("Connecting to the shared FARMERS marketplace...");
    if (!window.supabase || typeof window.supabase.createClient !== "function") {
        showBackendNotice("Marketplace could not load its Supabase client. Check your internet connection and reload.");
        return;
    }

    try {
        marketClient = window.FarmersAuth
            ? window.FarmersAuth.client
            : window.supabase.createClient(supabaseUrl, supabasePublicKey);
        const { data: sessionData, error: sessionError } = await marketClient.auth.getSession();
        if (sessionError) {
            throw sessionError;
        }

        const user = sessionData.session && sessionData.session.user;
        currentUserId = user ? user.id : null;
        updateMarketAccountLink(user);
        await loadRemoteMarketplace();
        marketClient.auth.onAuthStateChange((_event, session) => {
            currentUserId = session && session.user ? session.user.id : null;
            updateMarketAccountLink(session && session.user);
            loadRemoteMarketplace().catch((error) => {
                console.error("Could not refresh the shared marketplace.", error);
                showBackendNotice(getSupabaseSetupMessage(error));
            });
        });
    } catch (error) {
        console.error("Could not initialize the shared marketplace.", error);
        showBackendNotice(getSupabaseSetupMessage(error));
    }
}

async function loadRemoteMarketplace() {
    const { data: listings, error: listingError } = await marketClient
        .from("market_listings")
        .select("id, owner_id, title, name, category, price, unit, quantity, seller, location, description, image_path, image_url, created_at")
        .order("created_at", { ascending: false });
    if (listingError) {
        throw listingError;
    }

    const { data: contacts, error: contactsError } = await marketClient
        .from("market_listing_contacts")
        .select("listing_id, contact");
    if (contactsError) {
        throw contactsError;
    }
    const listingIdSet = new Set((listings || []).map((listing) => String(listing.id)));
    const contactsByListing = new Map((contacts || [])
        .filter((contact) => listingIdSet.has(String(contact.listing_id)))
        .map((contact) => [String(contact.listing_id), contact.contact]));

    let savedOffers = [];
    if (currentUserId) {
        const { data, error: offersError } = await marketClient
            .from("market_offers")
            .select("id, listing_id, buyer_id, buyer_name, amount, quantity, contact, message, created_at")
            .order("created_at", { ascending: false });
        if (offersError) {
            throw offersError;
        }
        savedOffers = data || [];
    }

    remoteListings = (listings || []).map((listing) => ({
        ...listing,
        name: listing.name || listing.title,
        remote: true,
        price: Number(listing.price),
        contact: contactsByListing.get(String(listing.id)) || "",
        image: listing.image_url || "market-produce.jpg",
    }));
    remoteOffers = (savedOffers || []).map((offer) => ({
        id: offer.id,
        listingId: offer.listing_id,
        buyerId: offer.buyer_id,
        buyer: offer.buyer_name,
        amount: Number(offer.amount),
        quantity: Number(offer.quantity),
        contact: offer.contact,
        message: offer.message,
        createdAt: offer.created_at,
    }));

    renderListings();
    showBackendNotice("");
}

async function uploadRemoteProductImage(listingId, file) {
    const extensions = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
    const extension = extensions[file.type];
    if (!extension) {
        throw new Error("Choose a JPG, PNG, or WebP product photo.");
    }
    const path = `${currentUserId}/${listingId}.${extension}`;
    const { error } = await marketClient.storage
        .from("market-product-images")
        .upload(path, file, { contentType: file.type, upsert: false });
    if (error) {
        throw error;
    }
    const { data } = marketClient.storage.from("market-product-images").getPublicUrl(path);
    return { path, url: data.publicUrl };
}

async function removeRemoteProductImage(path) {
    if (!path) {
        return;
    }
    const { error } = await marketClient.storage.from("market-product-images").remove([path]);
    if (error) {
        throw error;
    }
}

function formatPrice(value) {
    return new Intl.NumberFormat("en-KE", { maximumFractionDigits: 0 }).format(value);
}

function formatQuantityUnit(unit, quantity) {
    if (quantity === 1) {
        return unit;
    }
    const pluralUnits = { kg: "kg", bag: "bags", crate: "crates", animal: "animals", bird: "birds" };
    return pluralUnits[unit.toLocaleLowerCase()] || (unit.endsWith("s") ? unit : `${unit}s`);
}

function makeElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) {
        element.className = className;
    }
    if (text !== undefined) {
        element.textContent = text;
    }
    return element;
}

function getOffersForListing(listingId) {
    return [...remoteOffers, ...offers].filter((offer) => offer.listingId === listingId);
}

function renderProduct(listing) {
    const card = makeElement("article", "product-card");
    card.dataset.category = listing.category;
    card.dataset.name = `${listing.name} ${listing.location} ${listing.seller}`.toLocaleLowerCase();

    const imageWrap = makeElement("div", "product-image");
    const image = document.createElement("img");
    image.src = listing.image || "market-produce.jpg";
    image.alt = listing.name;
    image.loading = "lazy";
    if (listing.imageId) {
        getProductImage(listing.imageId).then((blob) => {
            if (blob && image.isConnected) {
                const imageUrl = URL.createObjectURL(blob);
                productImageUrls.push(imageUrl);
                image.src = imageUrl;
            }
        }).catch((error) => {
            console.error("Could not load product image.", error);
            showStorageError("could not load a product image");
        });
    }
    imageWrap.append(image, makeElement("span", "product-category", categoryNames[listing.category] || "Product"));

    const info = makeElement("div", "product-info");
    info.append(
        makeElement("h3", "", listing.name),
        makeElement("p", "product-location", `⌖ ${listing.location}`),
        makeElement("p", "product-seller", `By ${listing.seller}`),
    );

    const price = makeElement("p", "product-price", `KSh ${formatPrice(listing.price)}`);
    price.append(makeElement("span", "", ` / ${listing.unit}`));
    info.append(price, makeElement("p", "product-quantity", `${formatPrice(listing.quantity)} ${formatQuantityUnit(listing.unit, listing.quantity)} available`));

    const listingOffers = getOffersForListing(listing.id);
    let offersLabel = `${listingOffers.length} ${listingOffers.length === 1 ? "offer" : "offers"} received`;
    if (listingOffers.length > 0) {
        const bestOffer = Math.max(...listingOffers.map((offer) => Number(offer.amount) || 0));
        offersLabel += ` · Best KSh ${formatPrice(bestOffer)}`;
    }
    info.append(makeElement("p", "product-offers", offersLabel));

    const orderButton = makeElement("button", "product-order-button", "Order now");
    orderButton.type = "button";
    orderButton.setAttribute("aria-label", `Contact the farmer to order ${listing.name}`);
    orderButton.addEventListener("click", () => openOrderDialog(listing));
    info.append(orderButton);

    const bidButton = makeElement("button", "product-bid-button", "Make an offer");
    bidButton.type = "button";
    bidButton.dataset.listingId = listing.id;
    bidButton.addEventListener("click", () => {
        if (!requireMarketplaceSignIn()) {
            return;
        }
        openBidDialog(listing);
    });
    info.append(bidButton);

    const isOwner = userListings.some((userListing) => userListing.id === listing.id)
        || (listing.remote && listing.owner_id === currentUserId);
    if (isOwner) {
        const viewOffersButton = makeElement("button", "product-bid-button", `View offers (${listingOffers.length})`);
        viewOffersButton.type = "button";
        viewOffersButton.addEventListener("click", () => openOffersDialog(listing));
        info.append(viewOffersButton);

        const ownerActions = makeElement("div", "product-owner-actions");
        const deleteButton = makeElement("button", "product-delete-button", "Delete my listing");
        deleteButton.type = "button";
        deleteButton.setAttribute("aria-label", `Delete ${listing.name} listing`);
        deleteButton.addEventListener("click", () => deleteUserListing(listing));
        ownerActions.append(deleteButton);
        info.append(ownerActions);
    }

    card.append(imageWrap, info);
    return card;
}

function getOrderPhones(contact) {
    if (typeof contact !== "string") {
        return null;
    }
    const value = contact.trim();
    if (!/^[+\d\s().-]+$/.test(value)) {
        return null;
    }
    let digits = value.replace(/\D/g, "");
    if (digits.startsWith("00")) {
        digits = digits.slice(2);
    } else if (digits.startsWith("0") && digits.length === 10) {
        digits = `254${digits.slice(1)}`;
    } else if ((digits.startsWith("7") || digits.startsWith("1")) && digits.length === 9) {
        digits = `254${digits}`;
    }
    if (digits.length < 7 || digits.length > 15) {
        return null;
    }
    return {
        sms: `+${digits}`,
        whatsapp: digits
    };
}

function openOrderDialog(listing) {
    const phone = getOrderPhones(listing.contact);
    const message = `Hello, I would like to order ${listing.name} from your FARMERS marketplace listing.`;

    orderFarmer.textContent = `Contact ${listing.seller}`;
    orderPhoneInfo.textContent = phone
        ? `Farmer's phone: +${phone.whatsapp}`
        : "This farmer has not provided a valid phone number for this listing yet.";
    orderContactStatus.textContent = "";
    orderSmsLink.hidden = !phone;
    orderWhatsAppLink.hidden = !phone;
    copyOrderPhoneButton.hidden = !phone;
    if (phone) {
        orderSmsLink.href = `sms:${phone.sms}?body=${encodeURIComponent(message)}`;
        orderWhatsAppLink.href = `https://wa.me/${phone.whatsapp}?text=${encodeURIComponent(message)}`;
        copyOrderPhoneButton.dataset.phone = `+${phone.whatsapp}`;
    } else {
        orderSmsLink.removeAttribute("href");
        orderWhatsAppLink.removeAttribute("href");
        delete copyOrderPhoneButton.dataset.phone;
    }
    orderDialog.showModal();
}

function requireMarketplaceSignIn() {
    if (currentUserId) {
        return true;
    }
    location.href = "auth.html?return=marketplace.html";
    return false;
}

function renderListings() {
    const query = searchInput.value.trim().toLocaleLowerCase();
    const allListings = [...userListings, ...remoteListings, ...starterListings];
    const visibleListings = allListings.filter((listing) => {
        const matchesCategory = activeCategory === "all" || listing.category === activeCategory;
        const searchableText = `${listing.name} ${listing.location} ${listing.seller} ${listing.description || ""}`.toLocaleLowerCase();
        const matchesQuery = !query || query.split(/\s+/).every((term) => searchableText.includes(term));
        return matchesCategory && matchesQuery;
    });

    productImageUrls.forEach((url) => URL.revokeObjectURL(url));
    productImageUrls = [];
    productGrid.replaceChildren(...visibleListings.map(renderProduct));
    listingCount.textContent = `${visibleListings.length} ${visibleListings.length === 1 ? "product" : "products"}`;
    emptyState.hidden = visibleListings.length !== 0;
    clearSearchButton.hidden = query.length === 0;
}

function openBidDialog(listing) {
    selectedListingId = listing.id;
    bidForm.reset();
    bidForm.elements.quantity.value = "1";
    bidForm.elements.quantity.max = String(listing.quantity);
    bidProductSummary.textContent = `${listing.name} · KSh ${formatPrice(listing.price)} per ${listing.unit} · ${listing.quantity} ${formatQuantityUnit(listing.unit, listing.quantity)} available in ${listing.location}.`;
    bidDialog.showModal();
}

function openOffersDialog(listing) {
    const listingOffers = getOffersForListing(listing.id);
    sellerContact.textContent = `Contact buyers using their offer details. Your listing contact: ${listing.contact}`;
    sellerOffersList.replaceChildren();

    if (listingOffers.length === 0) {
        sellerOffersList.append(makeElement("p", "market-form-intro", "No offers yet. Buyers can send offers from this product card."));
    } else {
        for (const offer of listingOffers) {
            const offerCard = makeElement("article", "seller-offer");
            offerCard.append(
                makeElement("strong", "", offer.buyer),
                makeElement("span", "seller-offer-price", `KSh ${formatPrice(Number(offer.amount))} · ${formatPrice(Number(offer.quantity))} ${formatQuantityUnit(listing.unit, Number(offer.quantity))}`),
                makeElement("span", "", `Contact: ${offer.contact}`),
            );
            if (offer.message) {
                offerCard.append(makeElement("span", "", offer.message));
            }
            sellerOffersList.append(offerCard);
        }
    }

    offersDialog.showModal();
}

async function deleteUserListing(listing) {
    if (listing.remote) {
        if (listing.owner_id !== currentUserId) {
            return;
        }

        const confirmed = window.confirm(`Delete "${listing.name}"? This will also remove its saved offers.`);
        if (!confirmed) {
            return;
        }

        const { data, error } = await marketClient
            .from("market_listings")
            .delete()
            .eq("id", listing.id)
            .eq("owner_id", currentUserId)
            .select("id")
            .maybeSingle();
        if (error) {
            console.error("Could not delete shared product listing.", error);
            showBackendNotice(`Could not delete this listing: ${error.message}`);
            return;
        }
        if (!data) {
            showBackendNotice("This listing could not be deleted. Only its owner can remove it.");
            return;
        }

        remoteListings = remoteListings.filter((item) => item.id !== listing.id);
        remoteOffers = remoteOffers.filter((offer) => offer.listingId !== listing.id);
        renderListings();

        try {
            await removeRemoteProductImage(listing.image_path);
        } catch (imageError) {
            console.error("Listing was deleted, but its product photo could not be removed.", imageError);
            showBackendNotice(`Listing deleted, but its product photo could not be removed: ${imageError.message}`);
        }
        return;
    }

    const listingIndex = userListings.findIndex((item) => item.id === listing.id);
    if (listingIndex === -1) {
        return;
    }

    const confirmed = window.confirm(`Delete "${listing.name}"? This will also remove its saved offers.`);
    if (!confirmed) {
        return;
    }

    const updatedListings = userListings.filter((item) => item.id !== listing.id);
    const updatedOffers = offers.filter((offer) => offer.listingId !== listing.id);
    if (!saveStoredArray(storageKeys.listings, updatedListings)) {
        return;
    }

    if (!saveStoredArray(storageKeys.offers, updatedOffers)) {
        if (!saveStoredArray(storageKeys.listings, userListings)) {
            showStorageError("could not finish deleting the listing; reload the page to check its saved state");
        }
        return;
    }

    userListings = updatedListings;
    offers = updatedOffers;
    renderListings();

    if (listing.imageId) {
        try {
            await deleteProductImage(listing.imageId);
        } catch (error) {
            console.error("Listing was deleted, but its product image could not be removed.", error);
            showStorageError("deleted the listing but could not remove its product image");
        }
    }
}

function clearImagePreview() {
    imagePreview.hidden = true;
    imagePreviewPhoto.removeAttribute("src");
    if (imagePreviewUrl) {
        URL.revokeObjectURL(imagePreviewUrl);
        imagePreviewUrl = "";
    }
}

function clearSelectedImage() {
    selectedImageFile = null;
    imageInput.value = "";
    clearImagePreview();
}

imageInput.addEventListener("change", () => {
    imageError.hidden = true;
    const file = imageInput.files[0];
    if (!file) {
        clearSelectedImage();
        return;
    }

    const supportedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!supportedTypes.includes(file.type)) {
        clearSelectedImage();
        imageError.textContent = "Choose a JPG, PNG, or WebP image.";
        imageError.hidden = false;
        return;
    }
    if (file.size > 5 * 1024 * 1024) {
        clearSelectedImage();
        imageError.textContent = "The image must be 5 MB or smaller.";
        imageError.hidden = false;
        return;
    }

    clearImagePreview();
    selectedImageFile = file;
    imagePreviewUrl = URL.createObjectURL(file);
    imagePreviewPhoto.src = imagePreviewUrl;
    imagePreview.hidden = false;
});

document.getElementById("removeImage").addEventListener("click", clearSelectedImage);
listingForm.addEventListener("reset", () => {
    clearSelectedImage();
    imageError.hidden = true;
});

document.getElementById("openListing").addEventListener("click", () => {
    if (!requireMarketplaceSignIn()) {
        return;
    }
    listingForm.reset();
    listingDialog.showModal();
});

document.querySelectorAll("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => button.closest("dialog").close());
});

copyOrderPhoneButton.addEventListener("click", async () => {
    const phone = copyOrderPhoneButton.dataset.phone;
    if (!phone) {
        return;
    }
    try {
        await navigator.clipboard.writeText(phone);
        orderContactStatus.textContent = "Phone number copied.";
    } catch (error) {
        console.error("Could not copy the farmer's phone number.", error);
        orderContactStatus.textContent = `Could not copy automatically. Farmer's number: ${phone}`;
    }
});

document.querySelectorAll(".market-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
        activeCategory = chip.dataset.filter;
        document.querySelectorAll(".market-chip").forEach((item) => {
            const isActive = item === chip;
            item.classList.toggle("active", isActive);
            item.setAttribute("aria-pressed", String(isActive));
        });
        renderListings();
    });
});

searchInput.addEventListener("input", renderListings);
clearSearchButton.addEventListener("click", () => {
    searchInput.value = "";
    renderListings();
    searchInput.focus();
});

listingForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!listingForm.reportValidity()) {
        return;
    }
    const values = new FormData(listingForm);
    const listing = {
        id: `listing-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: String(values.get("name")).trim(),
        category: String(values.get("category")),
        price: Number(values.get("price")),
        unit: String(values.get("unit")).trim(),
        quantity: Number(values.get("quantity")),
        seller: String(values.get("seller")).trim(),
        location: String(values.get("location")).trim(),
        contact: String(values.get("contact")).trim(),
        description: String(values.get("description")).trim(),
        image: "market-produce.jpg",
    };

    if (!listing.name || !listing.seller || !listing.location || !listing.contact || listing.price <= 0 || listing.quantity <= 0) {
        return;
    }

    publishListingButton.disabled = true;
    publishListingButton.textContent = "Publishing...";
    imageError.hidden = true;
    let uploadedImagePath = null;
    let savedListing = null;
    try {
        if (!marketClient || !currentUserId) {
            throw new Error("Shared marketplace is not connected yet. Check the setup message on this page and try again.");
        }

        let imageUrl = null;
        if (selectedImageFile) {
            const uploadedImage = await uploadRemoteProductImage(createImageObjectId(), selectedImageFile);
            uploadedImagePath = uploadedImage.path;
            imageUrl = uploadedImage.url;
        }

        const { data: insertedListing, error: listingError } = await marketClient
            .from("market_listings")
            .insert([{
                owner_id: currentUserId,
                title: listing.name,
                name: listing.name,
                category: listing.category,
                price: listing.price,
                unit: listing.unit,
                quantity: listing.quantity,
                seller: listing.seller,
                location: listing.location,
                description: listing.description,
                image_path: uploadedImagePath,
                image_url: imageUrl,
            }])
            .select("id, owner_id, title, name, category, price, unit, quantity, seller, location, description, image_path, image_url, created_at")
            .single();
        if (listingError) {
            throw listingError;
        }
        savedListing = insertedListing;

        const { error: contactError } = await marketClient
            .from("market_listing_contacts")
            .insert([{ listing_id: String(savedListing.id), owner_id: currentUserId, contact: listing.contact }]);
        if (contactError) {
            throw contactError;
        }

        remoteListings.unshift({
            ...savedListing,
            remote: true,
            contact: listing.contact,
            price: Number(savedListing.price),
            image: imageUrl || "market-produce.jpg",
        });
        listingForm.reset();
        listingDialog.close();
        activeCategory = "all";
        searchInput.value = "";
        document.querySelectorAll(".market-chip").forEach((chip) => {
            const isActive = chip.dataset.filter === "all";
            chip.classList.toggle("active", isActive);
            chip.setAttribute("aria-pressed", String(isActive));
        });
        renderListings();
        document.getElementById("listings").scrollIntoView({ behavior: "smooth" });
    } catch (error) {
        console.error("Could not publish product listing.", error);
        imageError.textContent = `The listing could not be shared: ${error.message || "Check Supabase setup and try again."}`;
        imageError.hidden = false;
        showBackendNotice(getSupabaseSetupMessage(error));
        if (savedListing && marketClient && currentUserId) {
            const { error: rollbackError } = await marketClient
                .from("market_listings")
                .delete()
                .eq("id", savedListing.id)
                .eq("owner_id", currentUserId);
            if (rollbackError) {
                console.error("Could not remove an incomplete product listing.", rollbackError);
            }
        }
        if (uploadedImagePath) {
            try {
                await removeRemoteProductImage(uploadedImagePath);
            } catch (cleanupError) {
                console.error("Could not clean up an unsaved marketplace photo.", cleanupError);
            }
        }
    } finally {
        publishListingButton.disabled = false;
        publishListingButton.textContent = "Publish product";
    }
});

bidForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!bidForm.reportValidity()) {
        return;
    }
    const values = new FormData(bidForm);
    const amount = Number(values.get("offer"));
    const quantity = Number(values.get("quantity"));
    const listing = [...userListings, ...remoteListings, ...starterListings].find((item) => item.id === selectedListingId);
    if (!listing || amount <= 0 || quantity <= 0 || quantity > listing.quantity) {
        return;
    }

    const offer = {
        id: `offer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        listingId: selectedListingId,
        buyer: String(values.get("buyer")).trim(),
        amount,
        quantity,
        contact: String(values.get("contact")).trim(),
        message: String(values.get("message")).trim(),
        createdAt: new Date().toISOString(),
    };
    if (!offer.buyer || !offer.contact) {
        return;
    }

    if (listing.remote) {
        const submitButton = bidForm.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        submitButton.textContent = "Sending...";
        try {
            if (!marketClient || !currentUserId) {
                throw new Error("Shared marketplace is not connected.");
            }
            const { data, error } = await marketClient
                .from("market_offers")
                .insert([{
                    listing_id: listing.id,
                    buyer_id: currentUserId,
                    buyer_name: offer.buyer,
                    amount: offer.amount,
                    quantity: offer.quantity,
                    contact: offer.contact,
                    message: offer.message,
                }])
                .select("id, listing_id, buyer_id, buyer_name, amount, quantity, contact, message, created_at")
                .single();
            if (error) {
                throw error;
            }
            remoteOffers.unshift({
                id: data.id,
                listingId: data.listing_id,
                buyerId: data.buyer_id,
                buyer: data.buyer_name,
                amount: Number(data.amount),
                quantity: Number(data.quantity),
                contact: data.contact,
                message: data.message,
                createdAt: data.created_at,
            });
            bidDialog.close();
            renderListings();
        } catch (error) {
            console.error("Could not send marketplace offer.", error);
            showBackendNotice(`Offer could not be sent: ${error.message || "Check Supabase setup and try again."}`);
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = "Send offer";
        }
        return;
    }

    offers.unshift(offer);
    if (saveStoredArray(storageKeys.offers, offers)) {
        bidDialog.close();
        renderListings();
    } else {
        offers.shift();
    }
});

window.addEventListener("online", () => {
    document.getElementById("statusText").textContent = "Online";
});
window.addEventListener("offline", () => {
    document.getElementById("statusText").textContent = "Offline";
});
document.getElementById("statusText").textContent = navigator.onLine ? "Online" : "Offline";

renderListings();
initializeRemoteMarketplace();

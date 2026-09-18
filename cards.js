document.querySelectorAll(".card-header").forEach((header) => {
  header.addEventListener("click", () => {
    header.closest(".admin-card").classList.toggle("is-expanded");
  });
});

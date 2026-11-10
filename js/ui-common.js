"use strict";

/* ---------- DOM共通処理 ---------- */

const app = document.getElementById("app");

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) {
    node.textContent = String(text);
  }
  return node;
}

function clearApp() {
  app.replaceChildren();
}

function showMessage(text, isError = false) {
  messageText = isError ? "" : text;
  errorText = isError ? text : "";
}

function addMessage(container) {
  if (errorText) {
    container.appendChild(el("div","error",errorText));
  } else if (messageText) {
    container.appendChild(el("div","success",messageText));
  }
}

function makeButton(label, action, className = "") {
  const button = el("button",className,label);
  button.type = "button";
  button.dataset.action = action;
  return button;
}

function makeField(labelText, name, value, options = {}) {
  const wrapper = el("div","field");
  const label = el("label","",labelText);
  label.htmlFor = "field-" + name;

  let input;
  if (options.textarea) {
    input = document.createElement("textarea");
  } else {
    input = document.createElement("input");
    input.type = options.type || "number";
    if (input.type === "number") input.step = "any";
    if (options.inputmode) input.inputMode = options.inputmode;
  }

  input.id = "field-" + name;
  input.name = name;
  input.value = value === null || value === undefined ? "" : String(value);
  if (options.required) input.required = true;
  if (options.placeholder) input.placeholder = options.placeholder;

  wrapper.append(label,input);

  if (options.help) {
    wrapper.appendChild(el("div","help",options.help));
  }
  return wrapper;
}

function makeSelectField(labelText, name, options, selected) {
  const wrapper = el("div","field");
  const label = el("label","","");
  label.textContent = labelText;
  label.htmlFor = "field-" + name;

  const select = document.createElement("select");
  select.id = "field-" + name;
  select.name = name;

  for (const item of options) {
    const option = document.createElement("option");
    option.value = item.value;
    option.textContent = item.label;
    if (item.value === selected) option.selected = true;
    select.appendChild(option);
  }

  wrapper.append(label,select);
  return wrapper;
}

function updateNavigation() {
  document.querySelectorAll(".bottom-nav button").forEach(button => {
    button.classList.toggle("active",button.dataset.tab === currentTab);
  });
}

function heading(title) {
  return el("h2","",title);
}

export const selectors = {
  /**
   * CSS selector to tell Stretchy which elements can be resized. Defaults to
   * input, select, textarea. Main use case for modifying this is in case you
   * have a custom element that behaves like these and want Stretchy to stop
   * ignoring it. If you just want to filter which elements Stetchy resizes,
   * use filter below.
   */
  base: [
    "textarea",
    "select:not([size])",
    "input:not([type])",
    ...["text", "number", "url", "email", "tel"].map((t) => `input[type="${t}"]`),
  ].join(", "),

  /**
   * CSS selector that elements need to match to be resized.
   */
  filter: "*",
};

/**
 * Autosize one element based on its content. Note that this does not set up
 * any event listeners, it just calculates and sets the right dimension (width
 * or height, depending on the type of control) once.
 *
 * @param element the element to resize
 */
export function resize(element: Element) {
  if (!resizes(element)) {
    return;
  }

  let cs = getComputedStyle(element);
  let offset = 0;
  let isEmpty = true;

  if (isElementWithPlaceholder(element)) {
    if (!element.value && element.placeholder) {
      isEmpty = true;
      element.value = element.placeholder;
    }
  }

  if (isTextArea(element)) {
    element.style.height = "0";

    if (cs.boxSizing == "border-box") {
      offset = element.offsetHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    } else if (cs.boxSizing == "content-box") {
      offset = -element.clientHeight + parseFloat(cs.minHeight);
    }

    element.style.height = element.scrollHeight + offset + "px";
  } else if (isInput(element)) {
    // First test that it is actually visible, otherwise all measurements are off
    element.style.width = "1000px";

    if (element.offsetWidth) {
      element.style.width = "0";

      if (cs.boxSizing == "border-box") {
        offset = element.offsetWidth;
      } else if (cs.boxSizing == "padding-box") {
        offset = element.clientWidth;
      } else if (cs.boxSizing == "content-box") {
        offset = parseFloat(cs.minWidth);
      }

      let width = Math.max(offset, element.scrollWidth - element.clientWidth);

      element.style.width = width + "px";

      // To bulletproof, we will set scrollLeft to a
      // huge number, and read that back to see what it was clipped to
      // and increment width by that much, iteratively

      for (let i = 0; i < 10; i++) {
        // max iterations
        element.scrollLeft = 1e10;

        if (element.scrollLeft == 0) {
          break;
        }

        width += element.scrollLeft;

        element.style.width = width + "px";
      }
    } else {
      // Element is invisible, just set to something reasonable
      element.style.width = element.value.length + 1 + "ch";
    }
  } else if (isSelect(element)) {
    // if select element is empty, do nothing
    if (element.selectedIndex == -1) {
      return;
    }

    const selectedIndex = element.selectedIndex > 0 ? element.selectedIndex : 0;

    // Need to use dummy element to measure :(
    const option = document.createElement("_");
    option.textContent = element.options[selectedIndex].textContent;
    element.parentNode?.insertBefore(option, element.nextSibling);

    // The name of the appearance property, as it might be prefixed
    let appearance: keyof CSSStyleDeclaration = "appearance";

    for (const property in cs) {
      const value = cs[property];
      if (
        !/^(width|webkitLogicalWidth|length)$/.test(property) &&
        typeof value == "string" &&
        property in option.style
      ) {
        option.style[property] = value;

        if (/appearance$/i.test(property)) {
          appearance = property as keyof CSSStyleDeclaration;
        }
      }
    }

    option.style.width = "";

    if (option.offsetWidth > 0) {
      element.style.width = option.offsetWidth + "px";

      if (!cs[appearance] || cs[appearance] !== "none") {
        // Account for arrow
        element.style.width = "calc(" + element.style.width + " + var(--arrow-width, 2.1em))";
      }
    }

    option.parentNode?.removeChild(option);
  }

  if (isElementWithPlaceholder(element) && isEmpty) {
    element.value = "";
  }
}

let active = true;

/**
 * Set to `false` to temporarily disable Stretchy globally.
 */
export function setActive(isActive: boolean) {
  active = isActive;
}

/**
 * Apply {@linkcode resize} to a collection of elements, or all Stretchy is
 * set to apply to, if no argument is provided.
 */
export function resizeAll(
  elements: Element | Element[] | string | undefined,
  root: ParentNode = document
) {
  $$(elements || selectors.base, root).forEach((element) => {
    if (element.matches?.(selectors.filter)) {
      resize(element);
    }
  });
}

/**
 * Can Stretchy be used on this particular element? (checks if element is in
 * the DOM, if it's of the right type and if it matches the selector filter
 * provided by data-stretchy-selector, if the attribute is set.)
 *
 * @param element the element to check
 */
export function resizes(element: Element): boolean {
  return Boolean(
    element &&
      element.parentNode &&
      element.matches(selectors.base) &&
      element.matches(selectors.filter)
  );
}

function onChange(evt: Event) {
  if (!active) {
    return;
  }

  const target = evt.target;
  if (!target || !isElement(target)) {
    return;
  }

  if (target.matches(selectors.base) && target.matches(selectors.filter)) {
    resize(target);
  }
}

let observer: MutationObserver | null = null;

/**
 * Resize controls inside a given element, and monitor for changes. `root` can be
 * any {@linkcode Node}, including Shadow roots.
 */
export function init(root = document) {
  const scriptFilter = document.currentScript?.getAttribute("data-filter");
  const attrFilter1 = $$("[data-stretchy-filter]").pop()?.getAttribute("data-stretchy-filter");
  const attrFilter2 = document.body.getAttribute("data-stretchy-filter");

  selectors.filter = scriptFilter || attrFilter1 || attrFilter2 || selectors.filter;

  // Listen for changes
  root.addEventListener("input", onChange);

  // Firefox fires a change event instead of an input event
  root.addEventListener("change", onChange);

  // Resize all
  resizeAll(undefined, root);

  // Listen for new elements
  if (observer) {
    return;
  }

  observer = new MutationObserver((mutations) => {
    if (!active) {
      return;
    }

    mutations.forEach((mutation) => {
      if (mutation.type == "childList") {
        const elements = Array.from(mutation.addedNodes).filter((e) => isElement(e)) as Element[];
        resizeAll(elements);
      }
    });
  });

  observer.observe(root, {
    childList: true,
    subtree: true,
  });
}

const ready = new Promise<any>((resolve) => {
  if (document.readyState == "complete") {
    resolve(null);
  } else {
    document.addEventListener("DOMContentLoaded", resolve);
  }
  document.addEventListener("load", resolve); // failsafe
});

if (typeof window !== "undefined" && document.currentScript) {
  // If loaded from a module, don't do anything
  // Autosize whatever is currently available
  init();

  // Autosize all elements once the DOM is loaded

  // DOM already loaded?
  ready.then(() => init());

  // Autosize again on load
  window.addEventListener("load", () => init());
}

// Helper functions
type ElementWithPlaceholder = Element & {
  value: string;
  placeholder: string;
};

function isElementWithPlaceholder(el: Element): el is ElementWithPlaceholder {
  return "value" in el && "placeholder" in el;
}

function isElement(e: EventTarget): e is Element {
  return e instanceof Element;
}

function isTextArea(el: Element): el is HTMLTextAreaElement {
  return el.nodeName.toLowerCase() === "textarea";
}

function isInput(el: Element): el is HTMLInputElement {
  return el.nodeName.toLowerCase() === "input";
}

function isSelect(el: Element): el is HTMLSelectElement {
  return el.nodeName.toLowerCase() === "select";
}

function $$(expr: Element | Element[] | string | undefined, container: ParentNode = document) {
  if (expr instanceof Element) {
    return [expr];
  }
  if (typeof expr === "string") {
    return Array.from(container.querySelectorAll(expr));
  }
  return expr || [];
}

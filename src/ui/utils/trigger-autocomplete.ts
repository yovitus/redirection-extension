type TriggerAutocompleteOptions = {
	input: HTMLInputElement;
	getSuggestions: (query: string) => string[];
	onSelected?: (value: string) => void;
};

export type TriggerAutocompleteHandle = {
	refresh: () => void;
	close: () => void;
	destroy: () => void;
};

type TriggerAutocompleteState = {
	input: HTMLInputElement;
	menu: HTMLDivElement;
	options: string[];
	activeIndex: number;
	getSuggestions: (query: string) => string[];
	onSelected?: (value: string) => void;
};

export function createTriggerAutocomplete(options: TriggerAutocompleteOptions): TriggerAutocompleteHandle {
	const parent = options.input.parentElement;
	if (!parent) {
		return {
			refresh: () => {},
			close: () => {},
			destroy: () => {},
		};
	}

	const menu = document.createElement('div');
	menu.className = 'trigger-autocomplete-menu hidden';
	menu.setAttribute('role', 'listbox');
	parent.appendChild(menu);

	const state: TriggerAutocompleteState = {
		input: options.input,
		menu,
		options: [],
		activeIndex: -1,
		getSuggestions: options.getSuggestions,
		onSelected: options.onSelected,
	};

	const onFocus = () => {
		renderMenu(state);
	};
	const onInput = () => {
		renderMenu(state);
	};
	const onKeyDown = (event: KeyboardEvent) => {
		const isOpen = !state.menu.classList.contains('hidden') && state.options.length > 0;
		if (!isOpen) return;

		if (event.key === 'ArrowDown') {
			event.preventDefault();
			if (state.activeIndex < state.options.length - 1) {
				setActiveIndex(state, state.activeIndex + 1);
			} else {
				setActiveIndex(state, 0);
			}
			return;
		}

		if (event.key === 'ArrowUp') {
			event.preventDefault();
			if (state.activeIndex > 0) {
				setActiveIndex(state, state.activeIndex - 1);
			} else {
				setActiveIndex(state, state.options.length - 1);
			}
			return;
		}

		if (event.key === 'Escape') {
			hideMenu(state);
			return;
		}

		if ((event.key === 'Enter' || event.key === 'Tab') && state.activeIndex >= 0) {
			event.preventDefault();
			event.stopPropagation();
			event.stopImmediatePropagation();
			applySelection(state, state.options[state.activeIndex]);
		}
	};
	const onBlur = () => {
		window.setTimeout(() => {
			hideMenu(state);
		}, 80);
	};
	const onDocumentMouseDown = (event: MouseEvent) => {
		const target = event.target as Node | null;
		if (!target) {
			hideMenu(state);
			return;
		}
		if (state.input.contains(target) || state.menu.contains(target)) return;
		hideMenu(state);
	};

	state.input.addEventListener('focus', onFocus);
	state.input.addEventListener('input', onInput);
	state.input.addEventListener('keydown', onKeyDown, true);
	state.input.addEventListener('blur', onBlur);
	document.addEventListener('mousedown', onDocumentMouseDown);

	return {
		refresh: () => {
			if (document.activeElement === state.input) {
				renderMenu(state);
			}
		},
		close: () => {
			hideMenu(state);
		},
		destroy: () => {
			state.input.removeEventListener('focus', onFocus);
			state.input.removeEventListener('input', onInput);
			state.input.removeEventListener('keydown', onKeyDown, true);
			state.input.removeEventListener('blur', onBlur);
			document.removeEventListener('mousedown', onDocumentMouseDown);
			try {
				state.menu.remove();
			} catch (e) {}
		},
	};
}

function renderMenu(state: TriggerAutocompleteState) {
	state.options = state.getSuggestions(state.input.value);
	state.activeIndex = -1;
	if (state.options.length === 0) {
		hideMenu(state);
		return;
	}

	positionMenu(state);
	state.menu.innerHTML = '';
	state.options.forEach((value, index) => {
		const item = document.createElement('button');
		item.type = 'button';
		item.className = 'trigger-autocomplete-item';
		item.textContent = value;
		item.setAttribute('role', 'option');
		item.addEventListener('mouseenter', () => {
			setActiveIndex(state, index);
		});
		item.addEventListener('mousedown', (event) => {
			event.preventDefault();
			applySelection(state, value);
		});
		state.menu.appendChild(item);
	});
	state.menu.classList.remove('hidden');
}

function positionMenu(state: TriggerAutocompleteState) {
	const parent = state.input.parentElement as HTMLElement | null;
	if (!parent) return;
	if (window.getComputedStyle(parent).position === 'static') {
		parent.style.position = 'relative';
	}
	state.menu.style.left = `${state.input.offsetLeft}px`;
	state.menu.style.top = `${state.input.offsetTop + state.input.offsetHeight + 4}px`;
	state.menu.style.width = `${state.input.offsetWidth}px`;
}

function setActiveIndex(state: TriggerAutocompleteState, index: number) {
	state.activeIndex = index;
	const items = Array.from(state.menu.querySelectorAll<HTMLButtonElement>('.trigger-autocomplete-item'));
	items.forEach((item, itemIndex) => {
		item.classList.toggle('active', itemIndex === index);
	});
}

function applySelection(state: TriggerAutocompleteState, value: string) {
	state.input.value = value;
	hideMenu(state);
	state.input.focus();
	try {
		const end = value.length;
		state.input.setSelectionRange(end, end);
	} catch (e) {}
	if (typeof state.onSelected === 'function') {
		state.onSelected(value);
	}
}

function hideMenu(state: TriggerAutocompleteState) {
	state.menu.classList.add('hidden');
	state.menu.innerHTML = '';
	state.options = [];
	state.activeIndex = -1;
}

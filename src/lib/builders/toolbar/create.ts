import {
	addEventListener,
	builder,
	createElHelpers,
	executeCallbacks,
	handleRovingFocus,
	isHTMLElement,
	kbd,
} from '$lib/internal/helpers';
import type { Defaults } from '$lib/internal/types';
import { derived, get, writable } from 'svelte/store';
import type {
	CreateToolbarGroupProps,
	CreateToolbarProps,
	ToolbarGroupItemProps,
	ToolbarGroupType,
} from './types';

const defaults = {
	loop: true,
	orientation: 'horizontal',
} satisfies Defaults<CreateToolbarProps>;

const { name, selector } = createElHelpers('toolbar');

export const createToolbar = (props?: CreateToolbarProps) => {
	const withDefaults = { ...defaults, ...props } satisfies CreateToolbarProps;

	const loop = writable(withDefaults.loop);
	const orientation = writable(withDefaults.orientation);

	const options = {
		loop,
		orientation,
	};

	const root = builder(name(), {
		stores: orientation,
		returned: ($orientation) => {
			return {
				role: 'toolbar',
				'data-orientation': $orientation,
			};
		},
	});

	const button = builder(name('button'), {
		returned: () =>
			({
				role: 'button',
				type: 'button',
				tabIndex: -1,
			} as const),
		action: (node: HTMLElement) => {
			const unsub = addEventListener(node, 'keydown', handleKeyDown);

			return {
				destroy: unsub,
			};
		},
	});

	const link = builder(name('link'), {
		returned: () =>
			({
				role: 'link',
				'data-melt-toolbar-item': '',
				tabIndex: -1,
			} as const),
		action: (node: HTMLElement) => {
			const unsub = addEventListener(node, 'keydown', handleKeyDown);

			return {
				destroy: unsub,
			};
		},
	});

	const separator = builder(name('separator'), {
		stores: orientation,
		returned: ($orientation) => {
			return {
				role: 'separator',
				'data-orientation': $orientation === 'horizontal' ? 'vertical' : 'horizontal',
				'aria-orientation': $orientation === 'horizontal' ? 'vertical' : 'horizontal',
			} as const;
		},
	});

	const groupDefaults = {
		type: 'single',
		disabled: false,
	} satisfies CreateToolbarGroupProps;

	const createToolbarGroup = <T extends ToolbarGroupType = 'single'>(
		props?: CreateToolbarGroupProps<T>
	) => {
		const groupWithDefaults = { ...groupDefaults, ...props } as CreateToolbarGroupProps<T>;
		const type = writable(groupWithDefaults.type);
		const disabled = writable(groupWithDefaults.disabled);

		const options = {
			disabled,
		};

		const value = writable<string | string[] | undefined>(groupWithDefaults.value);

		const { name } = createElHelpers('toolbar-group');

		const root = builder(name(), {
			stores: orientation,
			returned: ($orientation) => {
				return {
					role: 'group',
					'data-orientation': $orientation,
				} as const;
			},
		});

		const item = builder(name('item'), {
			stores: [disabled, type, value, orientation],
			returned: ([$disabled, $type, $value, $orientation]) => {
				return (props: ToolbarGroupItemProps) => {
					const itemValue = typeof props === 'string' ? props : props.value;
					const argDisabled = typeof props === 'string' ? false : !!props.disabled;
					const disabled = $disabled || argDisabled;

					const pressed = Array.isArray($value) ? $value.includes(itemValue) : $value === itemValue;

					return {
						disabled,
						pressed,
						'data-orientation': $orientation,
						'data-disabled': disabled ? true : undefined,
						'data-value': itemValue,
						'data-state': pressed ? 'on' : 'off',
						'aria-pressed': pressed,
						type: 'button',
						role: $type === 'single' ? 'radio' : undefined,
						'data-melt-toolbar-item': '',
					} as const;
				};
			},
			action: (node: HTMLElement) => {
				const getNodeProps = () => {
					const itemValue = node.dataset.value;
					const disabled = node.dataset.disabled === 'true';

					return { value: itemValue, disabled };
				};

				const parentToolbar = node.closest<HTMLElement>('[data-melt-toolbar]');
				if (!parentToolbar) return;

				const items = getToolbarItems(parentToolbar);

				if (items[0] === node) {
					node.tabIndex = 0;
				} else {
					node.tabIndex = -1;
				}

				const unsub = executeCallbacks(
					addEventListener(node, 'click', () => {
						const { value: itemValue, disabled } = getNodeProps();
						if (itemValue === undefined || disabled) return;

						value.update(($value) => {
							if (groupWithDefaults.type === 'single') {
								return $value === itemValue ? undefined : itemValue;
							} else {
								const arrValue = $value as string[] | undefined;
								if (arrValue === undefined) {
									return [itemValue];
								} else {
									return arrValue.includes(itemValue)
										? arrValue.filter((v) => v !== itemValue)
										: [...arrValue, itemValue];
								}
							}
						});
					}),

					addEventListener(node, 'keydown', handleKeyDown)
				);

				return {
					destroy: unsub,
				};
			},
		});

		const isPressed = derived(value, ($value) => {
			return (itemValue: string) => {
				return Array.isArray($value) ? $value.includes(itemValue) : $value === itemValue;
			};
		});

		return {
			elements: {
				root,
				item,
			},
			states: {
				value,
			},
			helpers: {
				isPressed,
			},
			options,
		};
	};

	function handleKeyDown(e: KeyboardEvent) {
		const $orientation = get(orientation);
		const $loop = get(loop);

		const dir = 'ltr' as 'ltr' | 'rtl';
		const nextKey = {
			horizontal: dir === 'rtl' ? kbd.ARROW_LEFT : kbd.ARROW_RIGHT,
			vertical: kbd.ARROW_DOWN,
		}[$orientation ?? 'horizontal'];

		const prevKey = {
			horizontal: dir === 'rtl' ? kbd.ARROW_RIGHT : kbd.ARROW_LEFT,
			vertical: kbd.ARROW_UP,
		}[$orientation ?? 'horizontal'];

		const el = e.currentTarget;
		if (!isHTMLElement(el)) return;
		const root = el.closest<HTMLElement>('[data-melt-toolbar]');
		if (!isHTMLElement(root)) return;

		const items = Array.from(
			root.querySelectorAll<HTMLElement>(`${selector('item')}, ${selector('button')}`)
		);

		const currentIndex = items.indexOf(el);

		if (e.key === nextKey) {
			e.preventDefault();
			const nextIndex = currentIndex + 1;
			if (nextIndex >= items.length) {
				if ($loop) {
					handleRovingFocus(items[0]);
				}
			} else {
				handleRovingFocus(items[nextIndex]);
			}
		} else if (e.key === prevKey) {
			e.preventDefault();
			const prevIndex = currentIndex - 1;
			if (prevIndex < 0) {
				if ($loop) {
					handleRovingFocus(items[items.length - 1]);
				}
			} else {
				handleRovingFocus(items[prevIndex]);
			}
		} else if (e.key === kbd.HOME) {
			e.preventDefault();
			handleRovingFocus(items[0]);
		} else if (e.key === kbd.END) {
			e.preventDefault();
			handleRovingFocus(items[items.length - 1]);
		}
	}

	return {
		elements: {
			root,
			button,
			separator,
			link,
		},
		builders: {
			createToolbarGroup,
		},
		options,
	};
};

function getToolbarItems(element: HTMLElement) {
	return Array.from(
		element.querySelectorAll<HTMLElement>(`${selector('item')}, ${selector('button')}`)
	);
}

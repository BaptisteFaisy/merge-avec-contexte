/**
 * Doublure générique de `@forge/react` (UI Kit 2) pour les tests de rendu.
 *
 * Le vrai paquet tire `@forge/bridge` et lève hors plateforme : ce bouchon rend
 * de vrais nœuds HTML, portant un attribut `data-forge` pour les assertions.
 * Une seule fabrique alimentée par une table de composants — pas une fonction
 * par cas d'usage. Les hooks viennent du React racine (une seule copie).
 */
import React from 'react';

export { useCallback, useEffect, useState } from 'react';

type Props = Record<string, unknown>;

/** Élément HTML rendu pour chaque composant UI Kit 2. */
const BALISES: Record<string, string> = {
  Badge: 'span',
  Box: 'div',
  Button: 'button',
  Form: 'form',
  FormFooter: 'footer',
  FormSection: 'section',
  Heading: 'h2',
  Label: 'label',
  Link: 'a',
  SectionMessage: 'div',
  Select: 'select',
  Spinner: 'div',
  Stack: 'div',
  Text: 'span',
  TextField: 'input',
  Toggle: 'input',
};

/** Valeur d'un `Select` UI Kit : l'objet rendu en option, ou une simple valeur. */
function valeurOption(valeur: unknown): string | undefined {
  if (valeur && typeof valeur === 'object' && 'value' in (valeur as Record<string, unknown>)) {
    return (valeur as { value: string }).value;
  }
  return typeof valeur === 'string' ? valeur : undefined;
}

/** Options d'un `Select` -> éléments `<option>`. */
function optionsSelect(props: Props): Array<React.ReactElement> {
  const options = (props.options ?? []) as Array<{ label: string; value: string }>;
  return options.map((option) =>
    React.createElement('option', { key: option.value, value: option.value }, option.label),
  );
}

/** Valeurs des champs d'un formulaire, comme UI Kit 2 les livre à `onSubmit`. */
function valeursFormulaire(form: HTMLFormElement): Record<string, unknown> {
  const resultat: Record<string, unknown> = {};
  for (const champ of Array.from(form.elements)) {
    const element = champ as HTMLInputElement | HTMLSelectElement;
    if (!element.name) continue;
    if (element instanceof HTMLInputElement && element.type === 'checkbox') {
      resultat[element.name] = element.checked;
    } else if (element instanceof HTMLSelectElement && element.selectedOptions.length > 0) {
      const option = element.selectedOptions[0];
      resultat[element.name] = { label: option.textContent ?? '', value: option.value };
    } else {
      resultat[element.name] = element.value;
    }
  }
  return resultat;
}

/** Rendu générique : un élément HTML portant `data-forge`, plus les bons DOM props. */
function renduGenerique(nom: string, props: Props): React.ReactElement {
  let balise = BALISES[nom] ?? 'div';
  const dom: Props = { 'data-forge': nom };
  if (props.id !== undefined) dom.id = props.id;
  if (props.name !== undefined) dom.name = props.name;
  if (props.href !== undefined) dom.href = props.href;
  if (nom === 'Button') {
    dom.type = props.type ?? 'button';
    dom.disabled = Boolean(props.isDisabled);
    dom.onClick = props.onClick;
  } else if (nom === 'Label') {
    dom.htmlFor = props.labelFor ?? props.htmlFor;
  } else if (nom === 'Heading') {
    balise = (props.as as string) ?? 'h2';
  } else if (nom === 'Spinner') {
    dom.role = 'status';
  }
  return React.createElement(balise, dom, props.children);
}

/** Rendu de `Heading` (balise pilotée par `as`) et de `SectionMessage` (titre). */
function renduSectionMessage(props: Props): React.ReactElement {
  return React.createElement(
    'div',
    { 'data-forge': 'SectionMessage', 'data-appearance': props.appearance },
    props.title
      ? React.createElement('span', { 'data-forge': 'SectionMessage-titre' }, props.title as React.ReactNode)
      : null,
    React.createElement('div', { 'data-forge': 'SectionMessage-corps' }, props.children),
  );
}

/** Rendu de `Select` : vrai `<select>` avec ses options et sa sélection. */
function renduSelect(props: Props): React.ReactElement {
  const dom: Props = { 'data-forge': 'Select', id: props.id, name: props.name, onChange: props.onChange };
  // `value` = contrôlé (avec onChange) ; `defaultValue` = non contrôlé. On
  // respecte le mode de l'écran pour éviter l'avertissement React correspondant.
  if (props.value !== undefined) dom.value = valeurOption(props.value);
  else if (props.defaultValue !== undefined) dom.defaultValue = valeurOption(props.defaultValue);
  return React.createElement('select', dom, optionsSelect(props));
}

/** Rendu de `TextField` : vrai `<input type="text">`. */
function renduTextField(props: Props): React.ReactElement {
  return React.createElement('input', {
    'data-forge': 'TextField',
    type: 'text',
    id: props.id,
    name: props.name,
    value: props.value,
    defaultValue: props.defaultValue,
    placeholder: props.placeholder,
    required: Boolean(props.isRequired),
    onChange: props.onChange,
  });
}

/** Rendu de `Toggle` : une case à cocher suivie de son libellé. */
function renduToggle(props: Props): React.ReactElement {
  return React.createElement(
    'span',
    { 'data-forge': 'Toggle' },
    React.createElement('input', {
      type: 'checkbox',
      name: props.name,
      defaultChecked: Boolean(props.defaultChecked),
    }),
    props.label as React.ReactNode,
  );
}

/** Rendu de `Form` : un vrai `<form>` qui collecte ses champs puis `onSubmit`. */
function renduFormulaire(props: Props): React.ReactElement {
  return React.createElement(
    'form',
    {
      'data-forge': 'Form',
      onSubmit: (evenement: React.FormEvent<HTMLFormElement>) => {
        evenement.preventDefault();
        const valeurs = valeursFormulaire(evenement.currentTarget);
        (props.onSubmit as (valeurs: unknown) => void | undefined)?.(valeurs);
      },
    },
    props.children,
  );
}

/** Fabrique générique : un composant par nom, une seule fonction de rendu. */
function creerComposant(nom: string) {
  return function ComposantForge(props: Props): React.ReactElement {
    switch (nom) {
      case 'Form':
        return renduFormulaire(props);
      case 'Select':
        return renduSelect(props);
      case 'TextField':
        return renduTextField(props);
      case 'Toggle':
        return renduToggle(props);
      case 'SectionMessage':
        return renduSectionMessage(props);
      default:
        return renduGenerique(nom, props);
    }
  };
}

export const Badge = creerComposant('Badge');
export const Box = creerComposant('Box');
export const Button = creerComposant('Button');
export const Form = creerComposant('Form');
export const FormFooter = creerComposant('FormFooter');
export const FormSection = creerComposant('FormSection');
export const Heading = creerComposant('Heading');
export const Label = creerComposant('Label');
export const Link = creerComposant('Link');
export const SectionMessage = creerComposant('SectionMessage');
export const Select = creerComposant('Select');
export const Spinner = creerComposant('Spinner');
export const Stack = creerComposant('Stack');
export const Text = creerComposant('Text');
export const TextField = creerComposant('TextField');
export const Toggle = creerComposant('Toggle');
/**
 * Email string translations for guest-facing emails.
 * Owner emails are always in French (owner is always the Belgian host).
 * Usage: emailT[booking.lang] — falls back to 'fr' if lang is unrecognised.
 */

export const emailT = {
  fr: {
    // Guest acknowledgment (sent immediately on booking request)
    ack_subject:     (propertyName) => `Votre demande de réservation — ${propertyName}`,
    ack_heading:     'Votre demande a bien été reçue',
    ack_greeting:    (firstname) => `Bonjour ${firstname},`,
    ack_body:        (propertyName, ttlHours) =>
      `Nous avons bien reçu votre demande de réservation pour ${propertyName}. Le propriétaire vous répondra dans les <strong>${ttlHours}h</strong>.`,
    ack_col_checkin: 'Arrivée',
    ack_col_checkout:'Départ',
    ack_col_nights:  'Durée',
    ack_col_guests:  'Voyageurs',
    ack_nights:      (n) => `${n} nuit${n > 1 ? 's' : ''}`,
    ack_footer:      "Cet email est un accusé de réception automatique — aucune réservation n'est encore confirmée.",

    // Guest bank transfer instructions (sent on owner approval)
    pay_subject:       (propertyName) => `Votre réservation est approuvée — ${propertyName}`,
    pay_heading:       'Votre réservation est approuvée !',
    pay_greeting:      (firstname) => `Bonjour ${firstname},`,
    pay_body:          (propertyName) => `Le propriétaire de ${propertyName} a approuvé votre demande de réservation. Veuillez effectuer le virement bancaire selon les coordonnées ci-dessous pour finaliser votre séjour.`,
    pay_col_checkin:   'Arrivée',
    pay_col_checkout:  'Départ',
    pay_col_nights:    'Durée',
    pay_col_guests:    'Voyageurs',
    pay_col_total:     'Total',
    pay_nights:        (n) => `${n} nuit${n > 1 ? 's' : ''}`,
    pay_transfer_title:'Coordonnées bancaires',
    pay_iban_label:    'IBAN',
    pay_ref_label:     'Communication',
    pay_amount_label:  'Montant',
    pay_transfer_note: 'Mentionnez impérativement la communication indiquée ci-dessus. Votre réservation sera confirmée dès réception du virement.',

    // Guest rejection
    rej_subject:     (propertyName) => `Votre demande de réservation — ${propertyName}`,
    rej_heading:     'Votre demande de réservation',
    rej_greeting:    (firstname) => `Bonjour ${firstname},`,
    rej_body:        (propertyName) =>
      `Après examen de votre demande, le propriétaire de ${propertyName} n'est malheureusement pas en mesure d'accepter votre séjour pour les dates suivantes :`,
    rej_col_checkin: 'Arrivée',
    rej_col_checkout:'Départ',
    rej_col_nights:  'Durée',
    rej_col_guests:  'Voyageurs',
    rej_nights:      (n) => `${n} nuit${n > 1 ? 's' : ''}`,
    rej_footer:      "N'hésitez pas à consulter d'autres disponibilités sur notre site.",

    // Guest booking confirmation (sent after owner confirms payment receipt)
    conf_subject:    (propertyName) => `Confirmation de votre réservation — ${propertyName}`,
    conf_heading:    'Votre réservation est confirmée !',
    conf_greeting:   (firstname) => `Bonjour ${firstname},`,
    conf_body:       (propertyName) => `Votre virement a bien été reçu. Votre séjour à ${propertyName} est confirmé.`,
    conf_col_checkin:'Arrivée',
    conf_col_checkout:'Départ',
    conf_col_nights: 'Durée',
    conf_col_guests: 'Voyageurs',
    conf_col_total:  'Total payé',
    conf_nights:     (n) => `${n} nuit${n > 1 ? 's' : ''}`,
    conf_closing:    'Nous vous souhaitons un excellent séjour !',
  },

  en: {
    // Guest acknowledgment
    ack_subject:     (propertyName) => `Your booking request — ${propertyName}`,
    ack_heading:     'Your request has been received',
    ack_greeting:    (firstname) => `Hello ${firstname},`,
    ack_body:        (propertyName, ttlHours) =>
      `We have received your booking request for ${propertyName}. The owner will get back to you within <strong>${ttlHours}h</strong>.`,
    ack_col_checkin: 'Check-in',
    ack_col_checkout:'Check-out',
    ack_col_nights:  'Duration',
    ack_col_guests:  'Guests',
    ack_nights:      (n) => `${n} night${n > 1 ? 's' : ''}`,
    ack_footer:      'This email is an automatic acknowledgment — no booking has been confirmed yet.',

    // Guest bank transfer instructions
    pay_subject:       (propertyName) => `Your booking is approved — ${propertyName}`,
    pay_heading:       'Your booking is approved!',
    pay_greeting:      (firstname) => `Hello ${firstname},`,
    pay_body:          (propertyName) => `The owner of ${propertyName} has approved your booking request. Please complete a bank transfer using the details below to finalise your stay.`,
    pay_col_checkin:   'Check-in',
    pay_col_checkout:  'Check-out',
    pay_col_nights:    'Duration',
    pay_col_guests:    'Guests',
    pay_col_total:     'Total',
    pay_nights:        (n) => `${n} night${n > 1 ? 's' : ''}`,
    pay_transfer_title:'Bank transfer details',
    pay_iban_label:    'IBAN',
    pay_ref_label:     'Reference',
    pay_amount_label:  'Amount',
    pay_transfer_note: 'Please include the reference exactly as shown above. Your booking will be confirmed once the transfer has been received.',

    // Guest rejection
    rej_subject:     (propertyName) => `Your booking request — ${propertyName}`,
    rej_heading:     'Your booking request',
    rej_greeting:    (firstname) => `Hello ${firstname},`,
    rej_body:        (propertyName) =>
      `After reviewing your request, the owner of ${propertyName} is unfortunately unable to accommodate your stay for the following dates:`,
    rej_col_checkin: 'Check-in',
    rej_col_checkout:'Check-out',
    rej_col_nights:  'Duration',
    rej_col_guests:  'Guests',
    rej_nights:      (n) => `${n} night${n > 1 ? 's' : ''}`,
    rej_footer:      'Feel free to check other availability on our website.',

    // Guest booking confirmation (sent after owner confirms payment receipt)
    conf_subject:    (propertyName) => `Booking confirmation — ${propertyName}`,
    conf_heading:    'Your booking is confirmed!',
    conf_greeting:   (firstname) => `Hello ${firstname},`,
    conf_body:       (propertyName) => `Your bank transfer has been received. Your stay at ${propertyName} is confirmed.`,
    conf_col_checkin:'Check-in',
    conf_col_checkout:'Check-out',
    conf_col_nights: 'Duration',
    conf_col_guests: 'Guests',
    conf_col_total:  'Total paid',
    conf_nights:     (n) => `${n} night${n > 1 ? 's' : ''}`,
    conf_closing:    'We wish you an excellent stay!',
  },
};

/** Returns the translation object for the given lang, falling back to French. */
export function t(lang) {
  return emailT[lang] ?? emailT.fr;
}
